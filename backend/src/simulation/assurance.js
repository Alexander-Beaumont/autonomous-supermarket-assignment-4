import { round2 } from './helpers.js';

const TOLERANCE = 0.01;
const passDiff = value => Math.abs(Number(value)) <= TOLERANCE;

export function buildAssurance(db, runId) {
  const run = db.prepare('SELECT * FROM simulation_runs WHERE id = ?').get(runId);
  if (!run) throw new Error('Run not found.');

  const dayCount = db.prepare('SELECT COUNT(*) count FROM simulation_days WHERE run_id = ?').get(runId).count;
  const counts = {
    days: dayCount,
    products: db.prepare('SELECT COUNT(*) count FROM run_products WHERE run_id = ?').get(runId).count,
    customers: db.prepare('SELECT COUNT(*) count FROM customers WHERE run_id = ?').get(runId).count,
    demandEvents: db.prepare('SELECT COUNT(*) count FROM demand_events WHERE run_id = ?').get(runId).count,
    transactions: db.prepare('SELECT COUNT(*) count FROM transactions WHERE run_id = ?').get(runId).count,
    transactionItems: db.prepare('SELECT COUNT(*) count FROM transaction_items WHERE run_id = ?').get(runId).count,
    inventoryBatches: db.prepare('SELECT COUNT(*) count FROM inventory_batches WHERE run_id = ?').get(runId).count,
    inventoryMovements: db.prepare('SELECT COUNT(*) count FROM inventory_movements WHERE run_id = ?').get(runId).count,
    replenishmentOrders: db.prepare('SELECT COUNT(*) count FROM replenishment_orders WHERE run_id = ?').get(runId).count,
    replenishmentItems: db.prepare('SELECT COUNT(*) count FROM replenishment_items WHERE run_id = ?').get(runId).count,
    storeBrainEvents: db.prepare('SELECT COUNT(*) count FROM store_brain_events WHERE run_id = ?').get(runId).count,
    cashMovements: db.prepare('SELECT COUNT(*) count FROM cash_movements WHERE run_id = ?').get(runId).count
  };

  const inventoryRows = db.prepare(`
    SELECT
      p.product_id,
      p.name,
      p.category,
      p.initial_quantity opening_stock,
      COALESCE(SUM(CASE WHEN m.movement_type='REPLENISHMENT_RECEIPT' THEN m.quantity ELSE 0 END),0) replenishment_received,
      COALESCE(SUM(CASE WHEN m.movement_type='SALE' THEN m.quantity ELSE 0 END),0) units_sold,
      COALESCE(SUM(CASE WHEN m.movement_type='EXPIRY_WRITE_OFF' THEN m.quantity ELSE 0 END),0) units_written_off,
      COALESCE(SUM(m.quantity_delta),0) movement_balance
    FROM run_products p
    LEFT JOIN inventory_movements m ON m.run_id=p.run_id AND m.product_id=p.product_id
    WHERE p.run_id=?
    GROUP BY p.product_id, p.name, p.category, p.initial_quantity
    ORDER BY p.category, p.name
  `).all(runId).map(row => {
    const expectedClosing = Number(row.opening_stock) + Number(row.replenishment_received) - Number(row.units_sold) - Number(row.units_written_off);
    const closingFromMovements = Number(row.movement_balance);
    const difference = closingFromMovements - expectedClosing;
    return {
      ...row,
      expected_closing: expectedClosing,
      closing_stock: closingFromMovements,
      difference,
      status: passDiff(difference) && closingFromMovements >= 0 ? 'PASS' : 'FAIL'
    };
  });

  // Scan the append-only movement ledger in sequence to detect any transient negative balance.
  const movementLedger = db.prepare(`
    SELECT id, day_number, product_id, movement_type, quantity_delta, reference_id
    FROM inventory_movements
    WHERE run_id=?
    ORDER BY day_number, id
  `).all(runId);
  const running = new Map();
  const negativeStockIncidents = [];
  const oversellingIncidents = [];
  for (const row of movementLedger) {
    const before = running.get(row.product_id) || 0;
    const delta = Number(row.quantity_delta);
    if (row.movement_type === 'SALE' && Math.abs(delta) > before) {
      oversellingIncidents.push({ ...row, balance_before:before, attempted_sale_units:Math.abs(delta) });
    }
    const next = before + delta;
    running.set(row.product_id, next);
    if (next < 0) negativeStockIncidents.push({ ...row, balance_after: next });
  }

  const expiredSales = db.prepare(`
    SELECT m.id, m.day_number, m.product_id, p.name, m.quantity, m.batch_reference, b.expiry_day
    FROM inventory_movements m
    JOIN inventory_batches b
      ON b.run_id=m.run_id AND b.product_id=m.product_id AND b.source_reference=m.batch_reference
    JOIN run_products p ON p.run_id=m.run_id AND p.product_id=m.product_id
    WHERE m.run_id=?
      AND m.movement_type='SALE'
      AND b.expiry_day IS NOT NULL
      AND b.expiry_day <= m.day_number
    ORDER BY m.day_number, m.id
  `).all(runId);

  const revenueRows = db.prepare(`
    SELECT d.day_number,
      d.revenue reported_revenue,
      COALESCE(SUM(t.total),0) transaction_revenue
    FROM simulation_days d
    LEFT JOIN transactions t ON t.run_id=d.run_id AND t.day_number=d.day_number
    WHERE d.run_id=?
    GROUP BY d.day_number, d.revenue
    ORDER BY d.day_number
  `).all(runId).map(row => {
    const difference = round2(Number(row.reported_revenue) - Number(row.transaction_revenue));
    return { ...row, difference, status: passDiff(difference) ? 'PASS' : 'FAIL' };
  });

  const revenueTotals = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(revenue),0) FROM simulation_days WHERE run_id=?) day_sum,
      (SELECT COALESCE(SUM(total),0) FROM transactions WHERE run_id=?) transaction_sum
  `).get(runId, runId);
  const totalRevenueDifference = round2(Number(revenueTotals.day_sum) - Number(revenueTotals.transaction_sum));

  // Stronger traceability check: every transaction header must equal the sum of its stored line items.
  const transactionLineRows = db.prepare(`
    SELECT t.id, t.transaction_code, t.day_number,
      t.units transaction_units, t.total transaction_total, t.cogs transaction_cogs, t.gross_profit transaction_gross_profit,
      COALESCE(SUM(ti.quantity),0) item_units,
      ROUND(COALESCE(SUM(ti.line_revenue),0),2) item_revenue,
      ROUND(COALESCE(SUM(ti.line_cogs),0),2) item_cogs,
      (SELECT COUNT(*) FROM cash_movements cm
        WHERE cm.run_id=t.run_id AND cm.movement_type='SALE_RECEIPT'
          AND cm.reference_type='TRANSACTION' AND cm.reference_id=t.transaction_code) cash_receipt_count,
      ROUND(COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
        WHERE cm.run_id=t.run_id AND cm.movement_type='SALE_RECEIPT'
          AND cm.reference_type='TRANSACTION' AND cm.reference_id=t.transaction_code),0),2) cash_receipt_amount
    FROM transactions t
    LEFT JOIN transaction_items ti ON ti.transaction_id=t.id
    WHERE t.run_id=?
    GROUP BY t.id, t.transaction_code, t.day_number, t.units, t.total, t.cogs, t.gross_profit
    ORDER BY t.id
  `).all(runId).map(row => {
    const unitsDifference = Number(row.transaction_units) - Number(row.item_units);
    const revenueDifference = round2(Number(row.transaction_total) - Number(row.item_revenue));
    const cogsDifference = round2(Number(row.transaction_cogs) - Number(row.item_cogs));
    const expectedGrossProfit = round2(Number(row.transaction_total) - Number(row.transaction_cogs));
    const grossProfitDifference = round2(Number(row.transaction_gross_profit) - expectedGrossProfit);
    const cashReceiptDifference = round2(Number(row.cash_receipt_amount) - Number(row.transaction_total));
    const pass = unitsDifference === 0
      && passDiff(revenueDifference)
      && passDiff(cogsDifference)
      && passDiff(grossProfitDifference)
      && Number(row.cash_receipt_count) === 1
      && passDiff(cashReceiptDifference);
    return { ...row, units_difference:unitsDifference, revenue_difference:revenueDifference, cogs_difference:cogsDifference, gross_profit_difference:grossProfitDifference, cash_receipt_difference:cashReceiptDifference, status:pass ? 'PASS' : 'FAIL' };
  });

  // Daily Report roll-ups must agree with the underlying customer, transaction and inventory/event history.
  const dailyRollupRows = db.prepare(`
    WITH customer_daily AS (
      SELECT day_number, COUNT(*) recorded_customers
      FROM customers WHERE run_id=? GROUP BY day_number
    ), transaction_daily AS (
      SELECT day_number, COUNT(*) recorded_transactions, COALESCE(SUM(units),0) recorded_units,
        ROUND(COALESCE(SUM(cogs),0),2) recorded_cogs,
        ROUND(COALESCE(SUM(gross_profit),0),2) recorded_gross_profit
      FROM transactions WHERE run_id=? GROUP BY day_number
    ), expiry_daily AS (
      SELECT day_number, COALESCE(SUM(quantity),0) recorded_expiry_units,
        ROUND(COALESCE(SUM(movement_value),0),2) recorded_writeoff_value
      FROM inventory_movements
      WHERE run_id=? AND movement_type='EXPIRY_WRITE_OFF'
      GROUP BY day_number
    ), receipt_daily AS (
      SELECT day_number, COALESCE(SUM(quantity),0) recorded_received_units
      FROM inventory_movements
      WHERE run_id=? AND movement_type='REPLENISHMENT_RECEIPT'
      GROUP BY day_number
    ), order_daily AS (
      SELECT order_day day_number, COALESCE(SUM(ordered_quantity),0) recorded_ordered_units
      FROM replenishment_items WHERE run_id=? GROUP BY order_day
    ), brain_daily AS (
      SELECT day_number,
        SUM(CASE WHEN event_type='SOLD_OUT' THEN 1 ELSE 0 END) recorded_stockout_events,
        SUM(CASE WHEN event_type='LOW_STOCK' THEN 1 ELSE 0 END) recorded_low_stock_events,
        SUM(CASE WHEN event_type='EXPIRY_WARNING' THEN 1 ELSE 0 END) recorded_expiry_warning_events,
        SUM(CASE WHEN event_type='SLOW_MOVING' THEN 1 ELSE 0 END) recorded_slow_moving_events
      FROM store_brain_events WHERE run_id=? GROUP BY day_number
    )
    SELECT d.day_number,
      d.customer_visits, COALESCE(c.recorded_customers,0) recorded_customers,
      d.transactions, COALESCE(t.recorded_transactions,0) recorded_transactions,
      d.units_sold, COALESCE(t.recorded_units,0) recorded_units,
      d.cogs, COALESCE(t.recorded_cogs,0) recorded_cogs,
      d.gross_profit, COALESCE(t.recorded_gross_profit,0) recorded_gross_profit,
      d.expiry_units, COALESCE(e.recorded_expiry_units,0) recorded_expiry_units,
      d.expiry_writeoff_value, COALESCE(e.recorded_writeoff_value,0) recorded_writeoff_value,
      d.replenishment_received_units, COALESCE(rr.recorded_received_units,0) recorded_received_units,
      d.replenishment_ordered_units, COALESCE(o.recorded_ordered_units,0) recorded_ordered_units,
      d.stockout_events, COALESCE(b.recorded_stockout_events,0) recorded_stockout_events,
      d.low_stock_events, COALESCE(b.recorded_low_stock_events,0) recorded_low_stock_events,
      d.expiry_warning_events, COALESCE(b.recorded_expiry_warning_events,0) recorded_expiry_warning_events,
      d.slow_moving_events, COALESCE(b.recorded_slow_moving_events,0) recorded_slow_moving_events
    FROM simulation_days d
    LEFT JOIN customer_daily c ON c.day_number=d.day_number
    LEFT JOIN transaction_daily t ON t.day_number=d.day_number
    LEFT JOIN expiry_daily e ON e.day_number=d.day_number
    LEFT JOIN receipt_daily rr ON rr.day_number=d.day_number
    LEFT JOIN order_daily o ON o.day_number=d.day_number
    LEFT JOIN brain_daily b ON b.day_number=d.day_number
    WHERE d.run_id=?
    ORDER BY d.day_number
  `).all(runId, runId, runId, runId, runId, runId, runId).map(row => {
    const cogsDifference = round2(Number(row.cogs) - Number(row.recorded_cogs));
    const gpDifference = round2(Number(row.gross_profit) - Number(row.recorded_gross_profit));
    const writeoffDifference = round2(Number(row.expiry_writeoff_value) - Number(row.recorded_writeoff_value));
    const pass = Number(row.customer_visits) === Number(row.recorded_customers)
      && Number(row.transactions) === Number(row.recorded_transactions)
      && Number(row.units_sold) === Number(row.recorded_units)
      && passDiff(cogsDifference)
      && passDiff(gpDifference)
      && Number(row.expiry_units) === Number(row.recorded_expiry_units)
      && passDiff(writeoffDifference)
      && Number(row.replenishment_received_units) === Number(row.recorded_received_units)
      && Number(row.replenishment_ordered_units) === Number(row.recorded_ordered_units)
      && Number(row.stockout_events) === Number(row.recorded_stockout_events)
      && Number(row.low_stock_events) === Number(row.recorded_low_stock_events)
      && Number(row.expiry_warning_events) === Number(row.recorded_expiry_warning_events)
      && Number(row.slow_moving_events) === Number(row.recorded_slow_moving_events);
    return { ...row, cogs_difference:cogsDifference, gross_profit_difference:gpDifference, writeoff_difference:writeoffDifference, status:pass ? 'PASS' : 'FAIL' };
  });

  const cashRows = db.prepare(`
    SELECT d.day_number, d.opening_cash, d.revenue, d.replenishment_spend, d.closing_cash
    FROM simulation_days d WHERE d.run_id=? ORDER BY d.day_number
  `).all(runId).map(row => {
    const expectedClosing = round2(Number(row.opening_cash) + Number(row.revenue) - Number(row.replenishment_spend));
    const difference = round2(Number(row.closing_cash) - expectedClosing);
    return { ...row, expected_closing: expectedClosing, difference, status: passDiff(difference) ? 'PASS' : 'FAIL' };
  });

  const cashContinuity = [];
  for (let i = 1; i < cashRows.length; i += 1) {
    const prev = cashRows[i - 1];
    const current = cashRows[i];
    const difference = round2(Number(current.opening_cash) - Number(prev.closing_cash));
    if (!passDiff(difference)) cashContinuity.push({ day_number:current.day_number, prior_closing:prev.closing_cash, opening_cash:current.opening_cash, difference });
  }

  // Validate affordability, line totals, the fixed one-day lead time, and receipt completeness.
  const orderChecks = db.prepare(`
    SELECT ro.order_code, ro.order_day, ro.receive_day, ro.total_cost, ro.cash_before, ro.cash_after, ro.cash_constrained,
      COALESCE(SUM(ri.ordered_quantity),0) ordered_units,
      ROUND(COALESCE(SUM(ri.line_cost),0),2) line_cost_sum,
      COALESCE((SELECT SUM(m.quantity) FROM inventory_movements m
        WHERE m.run_id=ro.run_id AND m.movement_type='REPLENISHMENT_RECEIPT'
          AND m.reference_type='REPLENISHMENT_ORDER' AND m.reference_id=ro.order_code
          AND m.day_number=ro.receive_day),0) received_units
    FROM replenishment_orders ro
    LEFT JOIN replenishment_items ri ON ri.order_id=ro.id
    WHERE ro.run_id=?
    GROUP BY ro.id, ro.order_code, ro.order_day, ro.receive_day, ro.total_cost, ro.cash_before, ro.cash_after, ro.cash_constrained
    ORDER BY ro.order_day
  `).all(runId).map(row => {
    const overspend = round2(Number(row.total_cost) - Number(row.cash_before));
    const cashMathDifference = round2(Number(row.cash_after) - (Number(row.cash_before) - Number(row.total_cost)));
    const lineCostDifference = round2(Number(row.total_cost) - Number(row.line_cost_sum));
    const leadTimeDifference = Number(row.receive_day) - (Number(row.order_day) + 1);
    const receiptQuantityDifference = Number(row.received_units) - Number(row.ordered_units);
    const pass = overspend <= TOLERANCE
      && Number(row.cash_after) >= -TOLERANCE
      && passDiff(cashMathDifference)
      && passDiff(lineCostDifference)
      && leadTimeDifference === 0
      && Number(row.order_day) < 60
      && receiptQuantityDifference === 0;
    return { ...row, overspend, cash_math_difference:cashMathDifference, line_cost_difference:lineCostDifference, lead_time_difference:leadTimeDifference, receipt_quantity_difference:receiptQuantityDifference, status:pass ? 'PASS' : 'FAIL' };
  });

  const wholeCash = db.prepare(`
    SELECT
      r.opening_operating_cash,
      r.closing_operating_cash,
      COALESCE((SELECT SUM(revenue) FROM simulation_days WHERE run_id=r.id),0) sales_revenue,
      COALESCE((SELECT SUM(replenishment_spend) FROM simulation_days WHERE run_id=r.id),0) replenishment_spending
    FROM simulation_runs r WHERE r.id=?
  `).get(runId);
  const expectedFinalCash = round2(Number(wholeCash.opening_operating_cash) + Number(wholeCash.sales_revenue) - Number(wholeCash.replenishment_spending));
  const finalCashDifference = round2(Number(wholeCash.closing_operating_cash) - expectedFinalCash);

  const lastCashMovement = db.prepare(`
    SELECT balance_after FROM cash_movements WHERE run_id=? ORDER BY id DESC LIMIT 1
  `).get(runId);
  const cashLedgerDifference = round2(Number(lastCashMovement?.balance_after ?? run.opening_operating_cash) - Number(run.closing_operating_cash));

  const failures = [];
  if (dayCount !== 60) failures.push({ area:'History completeness', detail:`Expected 60 days but found ${dayCount}.` });
  if (inventoryRows.some(r => r.status === 'FAIL')) failures.push({ area:'Inventory reconciliation', detail:'One or more product inventory balances do not reconcile.' });
  if (negativeStockIncidents.length) failures.push({ area:'Inventory integrity', detail:`${negativeStockIncidents.length} negative-stock ledger incident(s) detected.` });
  if (oversellingIncidents.length) failures.push({ area:'Overselling integrity', detail:`${oversellingIncidents.length} sale event(s) attempted to exceed the inventory available immediately before the sale.` });
  if (expiredSales.length) failures.push({ area:'Expiry integrity', detail:`${expiredSales.length} sale movement(s) used an expired inventory batch.` });
  if (revenueRows.some(r => r.status === 'FAIL') || !passDiff(totalRevenueDifference)) failures.push({ area:'Revenue reconciliation', detail:'Daily or 60-day revenue does not reconcile to recorded transactions.' });
  if (transactionLineRows.some(r => r.status === 'FAIL')) failures.push({ area:'Transaction integrity', detail:'One or more transaction headers do not reconcile to their stored line items and sale cash receipt.' });
  if (dailyRollupRows.some(r => r.status === 'FAIL')) failures.push({ area:'Daily report integrity', detail:'One or more stored Daily Report roll-ups do not reconcile to underlying history.' });
  if (cashRows.some(r => r.status === 'FAIL') || cashContinuity.length || !passDiff(finalCashDifference) || !passDiff(cashLedgerDifference)) failures.push({ area:'Cash reconciliation', detail:'Operating cash does not reconcile to sales and replenishment payments.' });
  if (orderChecks.some(r => r.status === 'FAIL')) failures.push({ area:'Replenishment integrity', detail:'At least one order violates cash, line-total, one-day lead-time, Day-60, or receipt-completeness rules.' });

  const historyPass = dayCount === 60 && run.status === 'COMPLETED';
  const inventoryPass = inventoryRows.every(r => r.status === 'PASS') && negativeStockIncidents.length === 0 && oversellingIncidents.length === 0 && expiredSales.length === 0;
  const revenuePass = revenueRows.every(r => r.status === 'PASS') && passDiff(totalRevenueDifference);
  const cashPass = cashRows.every(r => r.status === 'PASS') && cashContinuity.length === 0 && passDiff(finalCashDifference) && passDiff(cashLedgerDifference);
  const transactionPass = transactionLineRows.every(r => r.status === 'PASS');
  const dailyRollupPass = dailyRollupRows.every(r => r.status === 'PASS');
  const replenishmentPass = orderChecks.every(r => r.status === 'PASS');

  return {
    run: {
      id:run.id,
      run_code:run.run_code,
      status:run.status,
      is_submitted:Boolean(run.is_submitted),
      engine_version:run.engine_version
    },
    overallStatus: failures.length === 0 ? 'PASS' : 'FAIL',
    summary: {
      historyCompleteness: { status:historyPass ? 'PASS' : 'FAIL', daysRetained:dayCount, expectedDays:60, counts },
      inventoryReconciliation: { status:inventoryPass ? 'PASS' : 'FAIL', productsChecked:inventoryRows.length, negativeStockIncidents:negativeStockIncidents.length, oversellingIncidents:oversellingIncidents.length, expiredProductSales:expiredSales.length },
      revenueReconciliation: { status:revenuePass ? 'PASS' : 'FAIL', dailyChecks:revenueRows.length, totalDifference:totalRevenueDifference },
      cashReconciliation: { status:cashPass ? 'PASS' : 'FAIL', dailyChecks:cashRows.length, finalCashDifference, cashLedgerDifference, ordersChecked:orderChecks.length },
      transactionIntegrity: { status:transactionPass ? 'PASS' : 'FAIL', transactionsChecked:transactionLineRows.length, failures:transactionLineRows.filter(r => r.status === 'FAIL').length },
      dailyReportIntegrity: { status:dailyRollupPass ? 'PASS' : 'FAIL', daysChecked:dailyRollupRows.length, failures:dailyRollupRows.filter(r => r.status === 'FAIL').length },
      replenishmentIntegrity: { status:replenishmentPass ? 'PASS' : 'FAIL', ordersChecked:orderChecks.length, failures:orderChecks.filter(r => r.status === 'FAIL').length }
    },
    inventoryRows,
    negativeStockIncidents,
    oversellingIncidents,
    expiredSales,
    revenueRows,
    revenueTotals: {
      dailyRevenueSum:round2(revenueTotals.day_sum),
      transactionRevenueSum:round2(revenueTotals.transaction_sum),
      difference:totalRevenueDifference
    },
    transactionLineRows,
    dailyRollupRows,
    cashRows,
    orderChecks,
    wholeCash: {
      openingCash:round2(wholeCash.opening_operating_cash),
      salesRevenue:round2(wholeCash.sales_revenue),
      replenishmentSpending:round2(wholeCash.replenishment_spending),
      expectedClosingCash:expectedFinalCash,
      recordedClosingCash:round2(wholeCash.closing_operating_cash),
      difference:finalCashDifference
    },
    exceptions: failures.length ? failures : [{ area:'Integrity exceptions', detail:`No material integrity failures or unexplained exceptions were detected in ${run.is_submitted ? 'the Submitted Run' : `completed run ${run.run_code}`}.` }]
  };
}
