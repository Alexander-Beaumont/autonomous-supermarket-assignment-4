import { buildAssurance } from './assurance.js';
import { round2, safeJsonParse } from './helpers.js';

function closingInventoryRows(db, runId) {
  return db.prepare(`
    WITH movement AS (
      SELECT product_id, SUM(quantity_delta) closing_qty
      FROM inventory_movements WHERE run_id=? GROUP BY product_id
    ), sales AS (
      SELECT product_id, SUM(quantity) sold_units, SUM(line_revenue) revenue
      FROM transaction_items WHERE run_id=? GROUP BY product_id
    )
    SELECT p.product_id, p.name, p.category, p.purchase_cost, p.selling_price,
      p.perishable, p.shelf_life_days, p.initial_quantity,
      COALESCE(m.closing_qty,0) closing_quantity,
      ROUND(COALESCE(m.closing_qty,0)*p.purchase_cost,2) closing_value,
      COALESCE(s.sold_units,0) units_sold,
      ROUND(COALESCE(s.revenue,0),2) revenue
    FROM run_products p
    LEFT JOIN movement m ON m.product_id=p.product_id
    LEFT JOIN sales s ON s.product_id=p.product_id
    WHERE p.run_id=?
    ORDER BY p.category, p.name
  `).all(runId, runId, runId);
}

export function getRunSummary(db, runId) {
  const run = db.prepare('SELECT * FROM simulation_runs WHERE id=?').get(runId);
  if (!run) throw new Error('Run not found.');
  const totals = db.prepare(`
    SELECT COUNT(*) days,
      SUM(customer_visits) total_customers,
      SUM(transactions) total_transactions,
      SUM(units_sold) total_units_sold,
      ROUND(SUM(revenue),2) revenue,
      ROUND(SUM(cogs),2) cogs,
      ROUND(SUM(gross_profit),2) gross_profit,
      ROUND(SUM(expiry_writeoff_value),2) expiry_writeoff_value,
      ROUND(SUM(replenishment_spend),2) replenishment_spending,
      SUM(stockout_events) stockout_events,
      SUM(low_stock_events) low_stock_events,
      SUM(expiry_warning_events) expiry_warning_events,
      SUM(slow_moving_events) slow_moving_events,
      SUM(cash_constraint_events) cash_constraint_events
    FROM simulation_days WHERE run_id=?
  `).get(runId);
  const inventory = closingInventoryRows(db, runId);
  const closingInventoryValue = round2(inventory.reduce((sum, row) => sum + Number(row.closing_value), 0));
  return {
    run: {
      ...run,
      is_submitted:Boolean(run.is_submitted),
      model_config:safeJsonParse(run.model_config_json),
      model_declaration:safeJsonParse(run.model_declaration_json)
    },
    totals:{ ...totals, closing_operating_cash:round2(run.closing_operating_cash ?? run.opening_operating_cash), closing_inventory_value:closingInventoryValue }
  };
}

export function buildCommercialReport(db, runId) {
  const { run, totals } = getRunSummary(db, runId);
  const days = db.prepare(`
    SELECT day_number, simulated_date, day_of_week, is_weekend, customer_visits,
      transactions, units_sold, revenue, cogs, gross_profit, expiry_units,
      expiry_writeoff_value, replenishment_spend, closing_cash,
      stockout_events, low_stock_events, expiry_warning_events,
      slow_moving_events, cash_constraint_events
    FROM simulation_days WHERE run_id=? ORDER BY day_number
  `).all(runId);

  const weekdayWeekend = db.prepare(`
    SELECT CASE WHEN is_weekend=1 THEN 'Weekend' ELSE 'Weekday' END period,
      COUNT(*) days,
      ROUND(AVG(customer_visits),2) avg_customers,
      ROUND(AVG(transactions),2) avg_transactions,
      ROUND(AVG(revenue),2) avg_revenue,
      ROUND(AVG(gross_profit),2) avg_gross_profit
    FROM simulation_days WHERE run_id=?
    GROUP BY is_weekend ORDER BY is_weekend
  `).all(runId);

  const shopper = {
    averageCustomersPerDay: round2((totals.total_customers || 0) / Math.max(1, totals.days || 60)),
    averageBasketSize: round2((totals.total_units_sold || 0) / Math.max(1, totals.total_transactions || 1)),
    averageTransactionValue: round2((totals.revenue || 0) / Math.max(1, totals.total_transactions || 1)),
    weekdayWeekend,
    byCustomerType: db.prepare(`
      SELECT customer_type, COUNT(*) visits,
        SUM(CASE WHEN transaction_id IS NOT NULL THEN 1 ELSE 0 END) purchasing_visits,
        ROUND(AVG(intended_basket_size),2) avg_intended_basket,
        ROUND(AVG(fulfilled_units),2) avg_fulfilled_units
      FROM customers WHERE run_id=? GROUP BY customer_type ORDER BY visits DESC
    `).all(runId),
    byMission: db.prepare(`
      SELECT shopping_mission, COUNT(*) visits,
        SUM(fulfilled_units) fulfilled_units,
        ROUND(AVG(fulfilled_units),2) avg_fulfilled_units
      FROM customers WHERE run_id=? GROUP BY shopping_mission ORDER BY visits DESC
    `).all(runId),
    byArrivalPeriod: db.prepare(`
      SELECT arrival_period, COUNT(*) visits,
        SUM(CASE WHEN transaction_id IS NOT NULL THEN 1 ELSE 0 END) transactions
      FROM customers WHERE run_id=? GROUP BY arrival_period
      ORDER BY CASE arrival_period WHEN 'Morning' THEN 1 WHEN 'Lunch' THEN 2 WHEN 'Afternoon' THEN 3 ELSE 4 END
    `).all(runId)
  };

  const categoryPerformance = db.prepare(`
    SELECT category,
      SUM(quantity) units_sold,
      ROUND(SUM(line_revenue),2) revenue,
      ROUND(SUM(line_cogs),2) cogs,
      ROUND(SUM(line_revenue-line_cogs),2) gross_profit
    FROM transaction_items WHERE run_id=?
    GROUP BY category ORDER BY revenue DESC
  `).all(runId);

  const productPerformance = db.prepare(`
    SELECT p.product_id, p.name, p.category,
      COALESCE(SUM(ti.quantity),0) units_sold,
      ROUND(COALESCE(SUM(ti.line_revenue),0),2) revenue,
      ROUND(COALESCE(SUM(ti.line_revenue-ti.line_cogs),0),2) gross_profit
    FROM run_products p
    LEFT JOIN transaction_items ti ON ti.run_id=p.run_id AND ti.product_id=p.product_id
    WHERE p.run_id=?
    GROUP BY p.product_id, p.name, p.category
    ORDER BY units_sold DESC, revenue DESC
  `).all(runId);

  const topProducts = productPerformance.slice(0, 10);
  const weakProducts = [...productPerformance].sort((a,b) => a.units_sold - b.units_sold || a.revenue - b.revenue).slice(0, 10);

  const writeoffsByProduct = db.prepare(`
    SELECT p.product_id, p.name, p.category,
      SUM(m.quantity) units_written_off,
      ROUND(SUM(m.movement_value),2) writeoff_value
    FROM inventory_movements m
    JOIN run_products p ON p.run_id=m.run_id AND p.product_id=m.product_id
    WHERE m.run_id=? AND m.movement_type='EXPIRY_WRITE_OFF'
    GROUP BY p.product_id, p.name, p.category
    ORDER BY writeoff_value DESC
  `).all(runId);

  const writeoffsByCategory = db.prepare(`
    SELECT p.category, SUM(m.quantity) units_written_off, ROUND(SUM(m.movement_value),2) writeoff_value
    FROM inventory_movements m
    JOIN run_products p ON p.run_id=m.run_id AND p.product_id=m.product_id
    WHERE m.run_id=? AND m.movement_type='EXPIRY_WRITE_OFF'
    GROUP BY p.category ORDER BY writeoff_value DESC
  `).all(runId);

  const replenishmentByProduct = db.prepare(`
    SELECT product_id, product_name, SUM(ordered_quantity) ordered_units,
      ROUND(SUM(line_cost),2) spending, COUNT(DISTINCT order_id) order_count
    FROM replenishment_items WHERE run_id=?
    GROUP BY product_id, product_name ORDER BY spending DESC
  `).all(runId);

  const brainEventSummary = db.prepare(`
    SELECT event_type, COUNT(*) count,
      SUM(CASE WHEN severity IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END) high_severity
    FROM store_brain_events WHERE run_id=?
    GROUP BY event_type ORDER BY count DESC
  `).all(runId);

  const inventoryPressureByProduct = db.prepare(`
    SELECT p.product_id, p.name, p.category,
      SUM(CASE WHEN e.event_type='SOLD_OUT' THEN 1 ELSE 0 END) stockout_events,
      SUM(CASE WHEN e.event_type='LOW_STOCK' THEN 1 ELSE 0 END) low_stock_events,
      COALESCE((SELECT COUNT(*) FROM demand_events d WHERE d.run_id=p.run_id AND d.product_id=p.product_id AND d.outcome='UNAVAILABLE'),0) unavailable_attempts
    FROM run_products p
    LEFT JOIN store_brain_events e ON e.run_id=p.run_id AND e.product_id=p.product_id
    WHERE p.run_id=?
    GROUP BY p.product_id,p.name,p.category
    HAVING stockout_events > 0 OR low_stock_events > 0
    ORDER BY stockout_events DESC, unavailable_attempts DESC, low_stock_events DESC
    LIMIT 12
  `).all(runId);

  const slowMovingProducts = db.prepare(`
    SELECT p.product_id, p.name, p.category,
      COUNT(e.id) slow_moving_event_days,
      MIN(e.day_number) first_flagged_day,
      MAX(e.day_number) last_flagged_day,
      COALESCE((SELECT SUM(m.quantity_delta) FROM inventory_movements m WHERE m.run_id=p.run_id AND m.product_id=p.product_id),0) closing_quantity,
      COALESCE((SELECT SUM(ti.quantity) FROM transaction_items ti WHERE ti.run_id=p.run_id AND ti.product_id=p.product_id),0) units_sold
    FROM run_products p
    JOIN store_brain_events e ON e.run_id=p.run_id AND e.product_id=p.product_id AND e.event_type='SLOW_MOVING'
    WHERE p.run_id=?
    GROUP BY p.product_id,p.name,p.category
    ORDER BY slow_moving_event_days DESC, closing_quantity DESC
  `).all(runId);

  const materialCases = db.prepare(`
    WITH ranked AS (
      SELECT e.day_number, e.event_type, e.product_id, e.product_name, e.severity,
        e.condition_text, e.action_text, e.outcome_text, e.metrics_json,
        ROW_NUMBER() OVER (
          PARTITION BY e.event_type
          ORDER BY CASE e.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WATCH' THEN 3 ELSE 4 END,
                   e.day_number DESC, e.id DESC
        ) rn
      FROM store_brain_events e
      WHERE e.run_id=? AND e.event_type IN ('LOW_STOCK','SOLD_OUT','EXPIRY_WARNING','SLOW_MOVING','REPLENISHMENT','CASH_CONSTRAINT')
    )
    SELECT day_number,event_type,product_id,product_name,severity,condition_text,action_text,outcome_text,metrics_json,rn
    FROM ranked WHERE rn <= 3
    ORDER BY CASE event_type
      WHEN 'SOLD_OUT' THEN 1 WHEN 'LOW_STOCK' THEN 2 WHEN 'EXPIRY_WARNING' THEN 3
      WHEN 'SLOW_MOVING' THEN 4 WHEN 'REPLENISHMENT' THEN 5 ELSE 6 END, rn
  `).all(runId).map(row => ({ ...row, metrics:safeJsonParse(row.metrics_json) }));

  const closingInventory = closingInventoryRows(db, runId);
  const findings = db.prepare(`SELECT * FROM commercial_findings WHERE run_id=? ORDER BY position`).all(runId);
  const assurance = buildAssurance(db, runId);

  return {
    run,
    part1BusinessPerformance: {
      storePerformance:totals,
      shopperPerformance:shopper,
      dailyActivity:days,
      categoryPerformance,
      topProducts,
      weakProducts
    },
    part2InventoryOperations: {
      eventTotals: {
        stockoutEvents:totals.stockout_events || 0,
        lowStockEvents:totals.low_stock_events || 0,
        expiryWarningEvents:totals.expiry_warning_events || 0,
        slowMovingEvents:totals.slow_moving_events || 0,
        cashConstraintEvents:totals.cash_constraint_events || 0
      },
      writeoffsByProduct,
      writeoffsByCategory,
      replenishmentByProduct,
      totalReplenishmentSpending:totals.replenishment_spending || 0,
      closingInventory,
      brainEventSummary,
      inventoryPressureByProduct,
      slowMovingProducts,
      materialCases
    },
    part3CommercialDiagnosis:{ findings },
    part4CommercialAssurance:{
      overallStatus:assurance.overallStatus,
      summary:assurance.summary,
      exceptions:assurance.exceptions
    }
  };
}

export function buildDailyReport(db, runId, dayNumber) {
  const day = db.prepare('SELECT * FROM simulation_days WHERE run_id=? AND day_number=?').get(runId, dayNumber);
  if (!day) throw new Error('Daily Report not found.');

  const customers = {
    byType:db.prepare(`SELECT customer_type, COUNT(*) visits, SUM(fulfilled_units) fulfilled_units FROM customers WHERE run_id=? AND day_number=? GROUP BY customer_type ORDER BY visits DESC`).all(runId, dayNumber),
    byMission:db.prepare(`SELECT shopping_mission, COUNT(*) visits, SUM(fulfilled_units) fulfilled_units FROM customers WHERE run_id=? AND day_number=? GROUP BY shopping_mission ORDER BY visits DESC`).all(runId, dayNumber),
    byPeriod:db.prepare(`SELECT arrival_period, COUNT(*) visits, SUM(CASE WHEN transaction_id IS NOT NULL THEN 1 ELSE 0 END) transactions FROM customers WHERE run_id=? AND day_number=? GROUP BY arrival_period ORDER BY CASE arrival_period WHEN 'Morning' THEN 1 WHEN 'Lunch' THEN 2 WHEN 'Afternoon' THEN 3 ELSE 4 END`).all(runId, dayNumber)
  };

  const transactions = db.prepare(`
    SELECT id, transaction_code, customer_code, arrival_period, units, total, cogs, gross_profit
    FROM transactions WHERE run_id=? AND day_number=? ORDER BY id
  `).all(runId, dayNumber);
  const itemStmt = db.prepare(`SELECT product_id, product_name, category, quantity, unit_sell_price, unit_cost, line_revenue, line_cogs FROM transaction_items WHERE transaction_id=? ORDER BY id`);
  const txWithItems = transactions.map(tx => ({ ...tx, items:itemStmt.all(tx.id) }));

  const brainEvents = db.prepare(`
    SELECT id, event_type, product_id, product_name, severity, condition_text, action_text, outcome_text, metrics_json
    FROM store_brain_events WHERE run_id=? AND day_number=?
    ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WATCH' THEN 3 ELSE 4 END, id
  `).all(runId, dayNumber).map(row => ({ ...row, metrics:safeJsonParse(row.metrics_json) }));

  const orders = db.prepare(`
    SELECT * FROM replenishment_orders WHERE run_id=? AND order_day=? ORDER BY id
  `).all(runId, dayNumber).map(order => ({
    ...order,
    items:db.prepare(`SELECT product_id, product_name, desired_quantity, ordered_quantity, unit_cost, line_cost, priority_score, reason FROM replenishment_items WHERE order_id=? ORDER BY priority_score DESC`).all(order.id)
  }));

  const inventoryMovements = db.prepare(`
    SELECT m.id, m.product_id, p.name product_name, p.category, m.movement_type,
      m.quantity, m.quantity_delta, m.unit_cost, m.movement_value, m.reference_type,
      m.reference_id, m.batch_reference
    FROM inventory_movements m
    JOIN run_products p ON p.run_id=m.run_id AND p.product_id=m.product_id
    WHERE m.run_id=? AND m.day_number=?
    ORDER BY m.id
  `).all(runId, dayNumber);

  const closingStock = db.prepare(`
    SELECT p.product_id, p.name, p.category,
      COALESCE((SELECT SUM(m.quantity_delta) FROM inventory_movements m
                WHERE m.run_id=p.run_id AND m.product_id=p.product_id AND m.day_number <= ?),0) AS closing_quantity
    FROM run_products p WHERE p.run_id=?
    ORDER BY p.category, p.name
  `).all(dayNumber, runId);

  const demandOutcomes = db.prepare(`
    SELECT outcome, COUNT(*) events, SUM(requested_quantity) requested_units, SUM(fulfilled_quantity) fulfilled_units
    FROM demand_events WHERE run_id=? AND day_number=? GROUP BY outcome ORDER BY events DESC
  `).all(runId, dayNumber);

  return {
    day,
    customers,
    transactions:txWithItems,
    brainEvents,
    replenishmentOrders:orders,
    inventoryMovements,
    closingStock,
    demandOutcomes
  };
}

export function buildModelView(db, runId) {
  const run = db.prepare('SELECT * FROM simulation_runs WHERE id=?').get(runId);
  if (!run) throw new Error('Run not found.');
  const products = db.prepare('SELECT * FROM run_products WHERE run_id=? ORDER BY category,name').all(runId);
  const openingBatches = db.prepare(`
    SELECT product_id, source_reference batch_reference, received_day, expiry_day, unit_cost, quantity_received
    FROM inventory_batches WHERE run_id=? AND source_type='OPENING' ORDER BY product_id, id
  `).all(runId);
  return {
    run:{ ...run, is_submitted:Boolean(run.is_submitted) },
    declaration:safeJsonParse(run.model_declaration_json),
    config:safeJsonParse(run.model_config_json),
    products,
    openingBatches
  };
}

export function buildStoreBrainView(db, runId) {
  return {
    summary:db.prepare(`SELECT event_type, COUNT(*) count FROM store_brain_events WHERE run_id=? GROUP BY event_type ORDER BY count DESC`).all(runId),
    events:db.prepare(`SELECT id, day_number, event_type, product_id, product_name, severity, condition_text, action_text, outcome_text, metrics_json FROM store_brain_events WHERE run_id=? ORDER BY day_number DESC, id DESC`).all(runId).map(r => ({...r, metrics:safeJsonParse(r.metrics_json)})),
    orders:db.prepare(`SELECT id, order_code, order_day, receive_day, total_cost, cash_before, cash_after, cash_constrained, rationale FROM replenishment_orders WHERE run_id=? ORDER BY order_day DESC`).all(runId).map(order => ({
      ...order,
      items:db.prepare(`SELECT product_id, product_name, desired_quantity, ordered_quantity, unit_cost, line_cost, priority_score, reason FROM replenishment_items WHERE order_id=? ORDER BY priority_score DESC`).all(order.id)
    }))
  };
}

export function buildProductAudit(db, runId, productId) {
  const product = db.prepare('SELECT * FROM run_products WHERE run_id=? AND product_id=?').get(runId, productId);
  if (!product) throw new Error('Product not found.');
  const movements = db.prepare(`
    SELECT id, day_number, movement_type, quantity, quantity_delta, unit_cost, movement_value,
      reference_type, reference_id, batch_reference
    FROM inventory_movements WHERE run_id=? AND product_id=? ORDER BY day_number,id
  `).all(runId, productId);
  let balance = 0;
  const ledger = movements.map(m => {
    balance += Number(m.quantity_delta);
    return { ...m, balance_after:balance };
  });
  const sales = db.prepare(`
    SELECT ti.day_number, t.transaction_code, ti.quantity, ti.unit_sell_price, ti.line_revenue, ti.line_cogs
    FROM transaction_items ti JOIN transactions t ON t.id=ti.transaction_id
    WHERE ti.run_id=? AND ti.product_id=? ORDER BY ti.day_number,t.id
  `).all(runId, productId);
  const brainEvents = db.prepare(`SELECT day_number,event_type,severity,condition_text,action_text,outcome_text,metrics_json FROM store_brain_events WHERE run_id=? AND product_id=? ORDER BY day_number,id`).all(runId, productId).map(r => ({...r,metrics:safeJsonParse(r.metrics_json)}));
  return { product, ledger, sales, brainEvents };
}

export function buildTransactionAudit(db, runId, transactionCode) {
  const transaction = db.prepare('SELECT * FROM transactions WHERE run_id=? AND transaction_code=?').get(runId, transactionCode);
  if (!transaction) throw new Error('Transaction not found.');
  const items = db.prepare('SELECT * FROM transaction_items WHERE transaction_id=? ORDER BY id').all(transaction.id);
  const movements = db.prepare(`SELECT * FROM inventory_movements WHERE run_id=? AND reference_type='TRANSACTION' AND reference_id=? ORDER BY id`).all(runId, transactionCode);
  const cash = db.prepare(`SELECT * FROM cash_movements WHERE run_id=? AND reference_type='TRANSACTION' AND reference_id=? ORDER BY id`).all(runId, transactionCode);
  return { transaction, items, inventoryMovements:movements, cashMovements:cash };
}
