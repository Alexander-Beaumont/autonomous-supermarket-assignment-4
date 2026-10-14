import { PRODUCT_CATALOG, openingInventoryCost } from '../catalog.js';
import {
  ENGINE_VERSION,
  MODEL_CONFIG,
  MODEL_DECLARATION,
  OPENING_INVENTORY_BUDGET,
  OPENING_OPERATING_CASH,
  SIMULATED_START_DATE
} from '../model.js';
import { SeededRng } from './rng.js';
import { analyseStoreBrain } from './brain.js';
import { dayName, isoDatePlusDays, round2 } from './helpers.js';
import { generateCommercialFindings } from './findings.js';

function asDbProduct(product) {
  return {
    product_id: product.id,
    name: product.name,
    category: product.category,
    pack_size: product.packSize,
    purchase_cost: product.purchaseCost,
    selling_price: product.sellingPrice,
    initial_quantity: product.initialQuantity,
    perishable: product.perishable ? 1 : 0,
    shelf_life_days: product.shelfLifeDays,
    popularity: product.popularity,
    essential_weight: product.essentialWeight,
    reorder_days_cover: product.reorderDaysCover,
    target_days_cover: product.targetDaysCover,
    slow_move_days_cover: product.slowMoveDaysCover
  };
}

function createRunCode(seed) {
  const timePart = Date.now().toString(36).toUpperCase();
  return `RUN-${timePart}-${String(seed).slice(-4).padStart(4, '0')}`;
}

function openingBatchPlan(product) {
  const total = product.initialQuantity;
  if (!product.perishable) {
    return [{ quantity: total, expiryDay: null }];
  }

  const shelf = product.shelfLifeDays;
  if (shelf <= 3) {
    const early = Math.max(1, Math.round(total * 0.28));
    return [
      { quantity: early, expiryDay: Math.max(2, shelf) },
      { quantity: total - early, expiryDay: shelf + 1 }
    ];
  }

  const q1 = Math.max(1, Math.round(total * 0.24));
  const q2 = Math.max(1, Math.round(total * 0.34));
  const q3 = total - q1 - q2;
  return [
    { quantity: q1, expiryDay: Math.max(2, Math.round(shelf * 0.62) + 1) },
    { quantity: q2, expiryDay: Math.max(3, Math.round(shelf * 0.82) + 1) },
    { quantity: q3, expiryDay: shelf + 1 }
  ].filter(batch => batch.quantity > 0);
}

export function initializeRun(db, {
  seed = Math.floor(Math.random() * 2_000_000_000),
  runCode = null,
  isSubmitted = false
} = {}) {
  const openingCost = openingInventoryCost();
  if (openingCost > OPENING_INVENTORY_BUDGET) {
    throw new Error(`Opening inventory cost ${openingCost} exceeds A$${OPENING_INVENTORY_BUDGET}.`);
  }

  const insertRun = db.prepare(`
    INSERT INTO simulation_runs (
      run_code, status, is_submitted, seed, engine_version, created_at,
      simulated_start_date, opening_inventory_budget, opening_inventory_cost,
      opening_operating_cash, model_config_json, model_declaration_json
    ) VALUES (?, 'INITIALIZED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProduct = db.prepare(`
    INSERT INTO run_products (
      run_id, product_id, name, category, pack_size, purchase_cost, selling_price,
      initial_quantity, perishable, shelf_life_days, popularity, essential_weight,
      reorder_days_cover, target_days_cover, slow_move_days_cover
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBatch = db.prepare(`
    INSERT INTO inventory_batches (
      run_id, product_id, source_type, source_reference, received_day,
      expiry_day, unit_cost, quantity_received
    ) VALUES (?, ?, 'OPENING', ?, 0, ?, ?, ?)
  `);

  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements (
      run_id, day_number, product_id, movement_type, quantity, quantity_delta,
      unit_cost, movement_value, reference_type, reference_id, batch_reference
    ) VALUES (?, 0, ?, 'OPENING', ?, ?, ?, ?, 'RUN_INITIALISATION', ?, ?)
  `);

  const insertCash = db.prepare(`
    INSERT INTO cash_movements (
      run_id, day_number, movement_type, amount, reference_type, reference_id, balance_after
    ) VALUES (?, 0, 'OPENING_CASH', ?, 'RUN_INITIALISATION', ?, ?)
  `);

  const transaction = db.transaction(() => {
    if (isSubmitted) {
      db.prepare('UPDATE simulation_runs SET is_submitted = 0 WHERE is_submitted = 1').run();
    }

    const now = new Date().toISOString();
    const code = runCode || createRunCode(seed);
    const result = insertRun.run(
      code,
      isSubmitted ? 1 : 0,
      Number(seed),
      ENGINE_VERSION,
      now,
      SIMULATED_START_DATE,
      OPENING_INVENTORY_BUDGET,
      openingCost,
      OPENING_OPERATING_CASH,
      JSON.stringify(MODEL_CONFIG),
      JSON.stringify(MODEL_DECLARATION)
    );
    const runId = Number(result.lastInsertRowid);

    for (const rawProduct of PRODUCT_CATALOG) {
      const p = asDbProduct(rawProduct);
      insertProduct.run(
        runId, p.product_id, p.name, p.category, p.pack_size,
        p.purchase_cost, p.selling_price, p.initial_quantity,
        p.perishable, p.shelf_life_days, p.popularity, p.essential_weight,
        p.reorder_days_cover, p.target_days_cover, p.slow_move_days_cover
      );

      const plan = openingBatchPlan(rawProduct);
      plan.forEach((batch, index) => {
        const batchRef = `OPEN-${p.product_id}-${index + 1}`;
        insertBatch.run(runId, p.product_id, batchRef, batch.expiryDay, p.purchase_cost, batch.quantity);
        insertMovement.run(
          runId, p.product_id, batch.quantity, batch.quantity,
          p.purchase_cost, round2(p.purchase_cost * batch.quantity),
          code, batchRef
        );
      });
    }

    insertCash.run(runId, OPENING_OPERATING_CASH, code, OPENING_OPERATING_CASH);
    return runId;
  });

  const runId = transaction();
  return getRun(db, runId);
}

export function getRun(db, runId) {
  return db.prepare('SELECT * FROM simulation_runs WHERE id = ?').get(runId);
}

function loadRuntimeBatches(db, runId) {
  const rows = db.prepare(`
    SELECT id, product_id, received_day, expiry_day, unit_cost, quantity_received,
           source_type, source_reference
    FROM inventory_batches
    WHERE run_id = ?
    ORDER BY id
  `).all(runId);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.product_id)) map.set(row.product_id, []);
    map.get(row.product_id).push({
      dbId: row.id,
      batchRef: row.source_reference || `BATCH-${row.id}`,
      receivedDay: row.received_day,
      expiryDay: row.expiry_day,
      unitCost: row.unit_cost,
      remaining: row.quantity_received
    });
  }
  return map;
}

function stockFor(batchesByProduct, productId) {
  return (batchesByProduct.get(productId) || []).reduce((sum, batch) => sum + Math.max(0, batch.remaining), 0);
}

function chooseCustomerType(rng, isWeekend, customerTypes) {
  return rng.weightedChoice(Object.entries(customerTypes).map(([value, data]) => ({
    value,
    weight: isWeekend ? data.weekendWeight : data.weekdayWeight
  })));
}

function chooseMission(rng, customerType, customerTypes) {
  const type = customerTypes[customerType];
  return rng.weightedChoice(Object.entries(type.missionWeights).map(([value, weight]) => ({ value, weight })));
}

function chooseArrivalPeriod(rng, mission, shoppingMissions) {
  return rng.weightedChoice(Object.entries(shoppingMissions[mission].arrivalWeights).map(([value, weight]) => ({ value, weight })));
}

function chooseProduct(rng, products, customerType, mission, customerTypes, shoppingMissions, excluded = new Set()) {
  const typeConfig = customerTypes[customerType];
  const missionConfig = shoppingMissions[mission];
  const weighted = products
    .filter(product => !excluded.has(product.product_id))
    .map(product => {
      const categoryMission = missionConfig.categoryWeights[product.category] ?? 0.1;
      const categoryAffinity = typeConfig.categoryAffinity[product.category] ?? 1;
      const microVariation = 0.90 + rng.next() * 0.20;
      return {
        value: product,
        weight: product.popularity * categoryMission * categoryAffinity * microVariation
      };
    });
  return rng.weightedChoice(weighted);
}

function selectSubstitute(rng, products, originalProduct, batchesByProduct, excluded = new Set()) {
  const candidates = products
    .filter(p => p.category === originalProduct.category && p.product_id !== originalProduct.product_id && !excluded.has(p.product_id))
    .filter(p => stockFor(batchesByProduct, p.product_id) > 0)
    .map(product => ({ value: product, weight: product.popularity }));
  return candidates.length ? rng.weightedChoice(candidates) : null;
}

function sellFromBatches(batchesByProduct, product, quantity, dayNumber) {
  const batches = (batchesByProduct.get(product.product_id) || [])
    .filter(batch => batch.remaining > 0 && (batch.expiryDay == null || batch.expiryDay > dayNumber))
    .sort((a, b) => {
      const aExpiry = a.expiryDay == null ? Number.MAX_SAFE_INTEGER : a.expiryDay;
      const bExpiry = b.expiryDay == null ? Number.MAX_SAFE_INTEGER : b.expiryDay;
      return aExpiry - bExpiry || a.receivedDay - b.receivedDay || a.dbId - b.dbId;
    });

  let remainingRequest = quantity;
  let sold = 0;
  let cogs = 0;
  const movementPieces = [];
  for (const batch of batches) {
    if (remainingRequest <= 0) break;
    const take = Math.min(batch.remaining, remainingRequest);
    if (take <= 0) continue;
    batch.remaining -= take;
    remainingRequest -= take;
    sold += take;
    cogs += take * batch.unitCost;
    movementPieces.push({ batchRef:batch.batchRef, quantity:take, unitCost:batch.unitCost });
  }

  return { sold, cogs:round2(cogs), movementPieces };
}

function recentCustomerMean(dayOfWeek, dayVisitMeans) {
  return dayVisitMeans[dayOfWeek] || 130;
}

export function runSimulation(db, runId) {
  const run = getRun(db, runId);
  if (!run) throw new Error('Simulation run not found.');
  if (run.status !== 'INITIALIZED') throw new Error(`Run ${run.run_code} cannot be started from status ${run.status}.`);

  const products = db.prepare('SELECT * FROM run_products WHERE run_id = ? ORDER BY product_id').all(runId);
  if (!products.length) throw new Error('Run has no product configuration.');

  const modelConfig = JSON.parse(run.model_config_json);
  const rules = modelConfig.rules;
  const customerTypes = modelConfig.customerTypes;
  const shoppingMissions = modelConfig.shoppingMissions;
  const dayVisitMeans = modelConfig.dayVisitMeans;
  const dayDemandFactors = modelConfig.dayDemandFactors;
  const simulationDays = modelConfig.simulationDays;
  if (!customerTypes || !shoppingMissions || !dayVisitMeans || !dayDemandFactors || simulationDays !== 60) {
    throw new Error('Run model snapshot is incomplete or invalid. Start a new run from a complete model configuration.');
  }
  const rng = new SeededRng(run.seed);
  const batchesByProduct = loadRuntimeBatches(db, runId);
  const salesHistory = new Map();

  const insertBatch = db.prepare(`
    INSERT INTO inventory_batches (
      run_id, product_id, source_type, source_reference, received_day, expiry_day,
      unit_cost, quantity_received
    ) VALUES (?, ?, 'REPLENISHMENT', ?, ?, ?, ?, ?)
  `);
  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements (
      run_id, day_number, product_id, movement_type, quantity, quantity_delta,
      unit_cost, movement_value, reference_type, reference_id, batch_reference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (
      run_id, day_number, transaction_code, customer_code, arrival_period,
      units, total, cogs, gross_profit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO transaction_items (
      transaction_id, run_id, day_number, product_id, product_name, category,
      quantity, unit_sell_price, unit_cost, line_revenue, line_cogs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDemand = db.prepare(`
    INSERT INTO demand_events (
      run_id, day_number, customer_code, product_id, requested_quantity,
      fulfilled_quantity, outcome, substitute_product_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      run_id, day_number, customer_code, customer_type, shopping_mission,
      arrival_period, intended_basket_size, fulfilled_units, transaction_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCash = db.prepare(`
    INSERT INTO cash_movements (
      run_id, day_number, movement_type, amount, reference_type, reference_id, balance_after
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrder = db.prepare(`
    INSERT INTO replenishment_orders (
      run_id, order_code, order_day, receive_day, total_cost, cash_before,
      cash_after, cash_constrained, rationale
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO replenishment_items (
      order_id, run_id, order_day, product_id, product_name, desired_quantity,
      ordered_quantity, unit_cost, line_cost, priority_score, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBrainEvent = db.prepare(`
    INSERT INTO store_brain_events (
      run_id, day_number, event_type, product_id, product_name, severity,
      condition_text, action_text, outcome_text, metrics_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDay = db.prepare(`
    INSERT INTO simulation_days (
      run_id, day_number, simulated_date, day_of_week, is_weekend,
      customer_visits, transactions, units_sold, revenue, cogs, gross_profit,
      expiry_units, expiry_writeoff_value, replenishment_received_units,
      replenishment_ordered_units, replenishment_spend, opening_cash, closing_cash,
      stockout_events, low_stock_events, expiry_warning_events, slow_moving_events,
      cash_constraint_events
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.prepare(`UPDATE simulation_runs SET status='RUNNING', started_at=? WHERE id=?`).run(new Date().toISOString(), runId);

  let cash = round2(run.opening_operating_cash);
  let transactionSequence = 0;

  for (let day = 1; day <= simulationDays; day += 1) {
    const executeDay = db.transaction(() => {
      const simulatedDate = isoDatePlusDays(run.simulated_start_date, day - 1);
      const dow = dayName(simulatedDate);
      const isWeekend = dow === 'Saturday' || dow === 'Sunday';
      const openingCash = cash;
      let replenishmentReceivedUnits = 0;
      let expiryUnits = 0;
      let expiryWriteoffValue = 0;
      let dayTransactions = 0;
      let dayUnitsSold = 0;
      let dayRevenue = 0;
      let dayCogs = 0;
      let dayReplenishmentOrderedUnits = 0;
      let dayReplenishmentSpend = 0;
      const daySales = new Map();

      // 1) Receive orders placed at the previous day-end.
      const incoming = db.prepare(`
        SELECT ro.order_code, ri.product_id, ri.ordered_quantity, ri.unit_cost
        FROM replenishment_orders ro
        JOIN replenishment_items ri ON ri.order_id = ro.id
        WHERE ro.run_id = ? AND ro.receive_day = ?
        ORDER BY ri.id
      `).all(runId, day);

      for (const item of incoming) {
        const product = products.find(p => p.product_id === item.product_id);
        const batchRef = `${item.order_code}-${item.product_id}`;
        const expiryDay = product.perishable ? day + product.shelf_life_days : null;
        const batchResult = insertBatch.run(
          runId, item.product_id, batchRef, day, expiryDay,
          item.unit_cost, item.ordered_quantity
        );
        if (!batchesByProduct.has(item.product_id)) batchesByProduct.set(item.product_id, []);
        batchesByProduct.get(item.product_id).push({
          dbId:Number(batchResult.lastInsertRowid), batchRef, receivedDay:day,
          expiryDay, unitCost:item.unit_cost, remaining:item.ordered_quantity
        });
        replenishmentReceivedUnits += item.ordered_quantity;
        insertMovement.run(
          runId, day, item.product_id, 'REPLENISHMENT_RECEIPT', item.ordered_quantity,
          item.ordered_quantity, item.unit_cost, round2(item.ordered_quantity * item.unit_cost),
          'REPLENISHMENT_ORDER', item.order_code, batchRef
        );
      }

      // 2) Remove stock that has reached expiry before customers arrive.
      for (const product of products) {
        if (!product.perishable) continue;
        const batches = batchesByProduct.get(product.product_id) || [];
        for (const batch of batches) {
          if (batch.remaining > 0 && batch.expiryDay != null && batch.expiryDay <= day) {
            const qty = batch.remaining;
            const value = round2(qty * batch.unitCost);
            batch.remaining = 0;
            expiryUnits += qty;
            expiryWriteoffValue = round2(expiryWriteoffValue + value);
            insertMovement.run(
              runId, day, product.product_id, 'EXPIRY_WRITE_OFF', qty, -qty,
              batch.unitCost, value, 'EXPIRY_ENGINE', `DAY-${day}`, batch.batchRef
            );
          }
        }
      }

      // 3) Generate structured customer activity and transactions.
      const meanVisits = recentCustomerMean(dow, dayVisitMeans);
      const customerVisits = Math.max(55, Math.round(rng.normal(meanVisits, meanVisits * 0.075)));
      const dayDemandFactor = dayDemandFactors[dow] || 1;

      for (let customerIndex = 1; customerIndex <= customerVisits; customerIndex += 1) {
        const customerCode = `D${String(day).padStart(2,'0')}-C${String(customerIndex).padStart(3,'0')}`;
        const customerType = chooseCustomerType(rng, isWeekend, customerTypes);
        const mission = chooseMission(rng, customerType, customerTypes);
        const arrivalPeriod = chooseArrivalPeriod(rng, mission, shoppingMissions);
        const missionConfig = shoppingMissions[mission];
        const intendedBasketSize = rng.int(missionConfig.basketMin, missionConfig.basketMax);
        const selected = new Set();
        const basket = new Map();
        const pendingMovements = [];

        for (let slot = 0; slot < intendedBasketSize; slot += 1) {
          const requestedProduct = chooseProduct(rng, products, customerType, mission, customerTypes, shoppingMissions, selected);
          if (!requestedProduct) break;
          selected.add(requestedProduct.product_id);
          const multiUnitChance = mission === 'Top-Up Grocery' || mission === 'Household Top-Up' ? 0.18 : 0.08;
          const requestedQuantity = rng.chance(multiUnitChance * dayDemandFactor) ? 2 : 1;
          const available = stockFor(batchesByProduct, requestedProduct.product_id);

          let saleProduct = requestedProduct;
          let outcome = 'FULFILLED';
          let substituteProductId = null;

          if (available <= 0) {
            if (rng.chance(rules.substitutionProbability)) {
              const substitute = selectSubstitute(rng, products, requestedProduct, batchesByProduct, selected);
              if (substitute) {
                saleProduct = substitute;
                substituteProductId = substitute.product_id;
                selected.add(substitute.product_id);
                outcome = 'SUBSTITUTED';
              } else {
                outcome = 'UNAVAILABLE';
              }
            } else {
              outcome = 'UNAVAILABLE';
            }
          }

          if (outcome === 'UNAVAILABLE') {
            insertDemand.run(runId, day, customerCode, requestedProduct.product_id, requestedQuantity, 0, outcome, null);
            continue;
          }

          const saleAvailable = stockFor(batchesByProduct, saleProduct.product_id);
          if (saleAvailable <= 0) {
            insertDemand.run(runId, day, customerCode, requestedProduct.product_id, requestedQuantity, 0, 'UNAVAILABLE', substituteProductId);
            continue;
          }

          const wantedForSale = Math.min(requestedQuantity, saleAvailable);
          const soldResult = sellFromBatches(batchesByProduct, saleProduct, wantedForSale, day);
          if (soldResult.sold <= 0) {
            insertDemand.run(runId, day, customerCode, requestedProduct.product_id, requestedQuantity, 0, 'UNAVAILABLE', substituteProductId);
            continue;
          }

          let demandOutcome = outcome;
          if (outcome !== 'SUBSTITUTED' && soldResult.sold < requestedQuantity) demandOutcome = 'PARTIAL';
          insertDemand.run(
            runId, day, customerCode, requestedProduct.product_id, requestedQuantity,
            soldResult.sold, demandOutcome, substituteProductId
          );

          if (!basket.has(saleProduct.product_id)) {
            basket.set(saleProduct.product_id, {
              product:saleProduct, quantity:0, cogs:0, revenue:0
            });
          }
          const line = basket.get(saleProduct.product_id);
          line.quantity += soldResult.sold;
          line.cogs = round2(line.cogs + soldResult.cogs);
          line.revenue = round2(line.revenue + soldResult.sold * saleProduct.selling_price);
          for (const piece of soldResult.movementPieces) {
            pendingMovements.push({ product:saleProduct, ...piece });
          }
        }

        const items = [...basket.values()];
        const fulfilledUnits = items.reduce((sum, item) => sum + item.quantity, 0);
        let transactionId = null;

        if (fulfilledUnits > 0) {
          transactionSequence += 1;
          const transactionCode = `TX-${String(day).padStart(2,'0')}-${String(transactionSequence).padStart(5,'0')}`;
          const total = round2(items.reduce((sum, item) => sum + item.revenue, 0));
          const cogs = round2(items.reduce((sum, item) => sum + item.cogs, 0));
          const grossProfit = round2(total - cogs);
          const txResult = insertTransaction.run(
            runId, day, transactionCode, customerCode, arrivalPeriod,
            fulfilledUnits, total, cogs, grossProfit
          );
          transactionId = Number(txResult.lastInsertRowid);

          for (const item of items) {
            insertItem.run(
              transactionId, runId, day, item.product.product_id, item.product.name,
              item.product.category, item.quantity, item.product.selling_price,
              round2(item.cogs / item.quantity), item.revenue, item.cogs
            );
            daySales.set(item.product.product_id, (daySales.get(item.product.product_id) || 0) + item.quantity);
          }
          for (const movement of pendingMovements) {
            insertMovement.run(
              runId, day, movement.product.product_id, 'SALE', movement.quantity,
              -movement.quantity, movement.unitCost,
              round2(movement.quantity * movement.unitCost),
              'TRANSACTION', transactionCode, movement.batchRef
            );
          }

          cash = round2(cash + total);
          insertCash.run(runId, day, 'SALE_RECEIPT', total, 'TRANSACTION', transactionCode, cash);
          dayTransactions += 1;
          dayUnitsSold += fulfilledUnits;
          dayRevenue = round2(dayRevenue + total);
          dayCogs = round2(dayCogs + cogs);
        }

        insertCustomer.run(
          runId, day, customerCode, customerType, mission, arrivalPeriod,
          intendedBasketSize, fulfilledUnits, transactionId
        );
      }

      salesHistory.set(day, daySales);

      // 4) End-of-day autonomous Store Brain review.
      const brain = analyseStoreBrain({
        dayNumber:day,
        products,
        stockByProduct: productId => stockFor(batchesByProduct, productId),
        batchesByProduct,
        salesHistory,
        rules
      });

      for (const event of brain.events) {
        insertBrainEvent.run(
          runId, day, event.eventType, event.productId, event.productName,
          event.severity, event.conditionText, event.actionText, event.outcomeText,
          JSON.stringify(event.metrics)
        );
      }

      let cashConstraintCount = 0;
      if (day < 60 && brain.candidates.length > 0) {
        const cashBeforeOrder = cash;
        let budgetCash = cashBeforeOrder;
        const orderItems = [];
        const constrained = [];
        const totalDesiredCost = round2(brain.candidates.reduce(
          (sum, candidate) => sum + candidate.desiredQuantity * candidate.product.purchase_cost, 0
        ));

        for (const candidate of brain.candidates) {
          const unitCost = candidate.product.purchase_cost;
          const maxAffordable = Math.max(0, Math.floor((budgetCash + 1e-9) / unitCost));
          const orderedQuantity = Math.min(candidate.desiredQuantity, maxAffordable);
          if (orderedQuantity > 0) {
            const lineCost = round2(orderedQuantity * unitCost);
            budgetCash = round2(budgetCash - lineCost);
            orderItems.push({ ...candidate, orderedQuantity, lineCost });
          }
          if (orderedQuantity < candidate.desiredQuantity) {
            constrained.push({
              product: candidate.product,
              desiredQuantity:candidate.desiredQuantity,
              orderedQuantity,
              unfundedQuantity:candidate.desiredQuantity - orderedQuantity
            });
          }
        }

        if (orderItems.length > 0) {
          const orderCode = `PO-D${String(day).padStart(2,'0')}`;
          const totalCost = round2(orderItems.reduce((sum, item) => sum + item.lineCost, 0));
          const cashAfter = round2(cashBeforeOrder - totalCost);
          const orderResult = insertOrder.run(
            runId, orderCode, day, day + 1, totalCost, cashBeforeOrder,
            cashAfter, constrained.length ? 1 : 0,
            'Store Brain ranked sold-out and low-stock products using urgency, recent sales velocity, essentiality and margin, then allocated available cash in priority order.'
          );
          const orderId = Number(orderResult.lastInsertRowid);

          for (const item of orderItems) {
            insertOrderItem.run(
              orderId, runId, day, item.product.product_id, item.product.name,
              item.desiredQuantity, item.orderedQuantity, item.product.purchase_cost,
              item.lineCost, item.priorityScore, item.reason
            );
            insertBrainEvent.run(
              runId, day, 'REPLENISHMENT', item.product.product_id, item.product.name,
              item.orderedQuantity < item.desiredQuantity ? 'HIGH' : 'INFO',
              item.reason,
              `Order ${item.orderedQuantity} units for Day ${day + 1} receipt.`,
              `A$${item.lineCost.toFixed(2)} committed; operating cash will reduce when the order is placed.`,
              JSON.stringify({
                desiredQuantity:item.desiredQuantity,
                orderedQuantity:item.orderedQuantity,
                unitCost:item.product.purchase_cost,
                lineCost:item.lineCost,
                priorityScore:item.priorityScore,
                receiveDay:day + 1
              })
            );
            dayReplenishmentOrderedUnits += item.orderedQuantity;
          }

          cash = cashAfter;
          dayReplenishmentSpend = totalCost;
          insertCash.run(runId, day, 'REPLENISHMENT_PAYMENT', -totalCost, 'REPLENISHMENT_ORDER', orderCode, cash);
        }

        if (constrained.length > 0) {
          cashConstraintCount = 1;
          const placedCost = orderItems.reduce((sum, item) => sum + item.lineCost, 0);
          const unfundedUnits = constrained.reduce((sum, item) => sum + item.unfundedQuantity, 0);
          insertBrainEvent.run(
            runId, day, 'CASH_CONSTRAINT', null, null, 'HIGH',
            `Desired replenishment cost A$${totalDesiredCost.toFixed(2)} exceeded cash that could be allocated without overspending.`,
            'Prioritise the most operationally important lines and partially fill or defer lower-priority demand.',
            `${unfundedUnits} desired units were deferred; placed replenishment cost was A$${round2(placedCost).toFixed(2)}.`,
            JSON.stringify({
              cashAvailable:cashBeforeOrder,
              desiredCost:totalDesiredCost,
              placedCost:round2(placedCost),
              unfundedUnits,
              constrainedProducts:constrained.length
            })
          );
        }
      }

      const grossProfit = round2(dayRevenue - dayCogs);
      const eventCounts = brain.events.reduce((acc, event) => {
        acc[event.eventType] = (acc[event.eventType] || 0) + 1;
        return acc;
      }, {});

      insertDay.run(
        runId, day, simulatedDate, dow, isWeekend ? 1 : 0,
        customerVisits, dayTransactions, dayUnitsSold, dayRevenue, dayCogs,
        grossProfit, expiryUnits, expiryWriteoffValue, replenishmentReceivedUnits,
        dayReplenishmentOrderedUnits, dayReplenishmentSpend, openingCash, cash,
        eventCounts.SOLD_OUT || 0,
        eventCounts.LOW_STOCK || 0,
        eventCounts.EXPIRY_WARNING || 0,
        eventCounts.SLOW_MOVING || 0,
        cashConstraintCount
      );
    });

    executeDay();
  }

  // Persist the final cash value while the run is still RUNNING so the evidence-based
  // commercial findings can read the complete 60-day result. The final status change
  // then freezes both configuration/history and the derived findings.
  db.prepare(`UPDATE simulation_runs SET closing_operating_cash=? WHERE id=?`).run(cash, runId);
  generateCommercialFindings(db, runId);
  db.prepare(`
    UPDATE simulation_runs
    SET status='COMPLETED', completed_at=?
    WHERE id=?
  `).run(new Date().toISOString(), runId);

  return getRun(db, runId);
}
