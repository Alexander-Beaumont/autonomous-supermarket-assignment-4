import { percent, round2 } from './helpers.js';

export function generateCommercialFindings(db, runId) {
  db.prepare('DELETE FROM commercial_findings WHERE run_id = ?').run(runId);

  const run = db.prepare('SELECT * FROM simulation_runs WHERE id = ?').get(runId);
  const evidenceRunLabel = run.is_submitted ? 'Submitted Run' : `completed run ${run.run_code}`;
  const totals = db.prepare(`
    SELECT
      SUM(customer_visits) customers,
      SUM(transactions) transactions,
      SUM(units_sold) units_sold,
      SUM(revenue) revenue,
      SUM(cogs) cogs,
      SUM(gross_profit) gross_profit,
      SUM(expiry_writeoff_value) writeoff_value,
      SUM(replenishment_spend) replenishment_spend
    FROM simulation_days WHERE run_id = ?
  `).get(runId);

  const weekday = db.prepare(`
    SELECT AVG(revenue) avg_revenue, AVG(customer_visits) avg_customers
    FROM simulation_days WHERE run_id = ? AND is_weekend = 0
  `).get(runId);
  const weekend = db.prepare(`
    SELECT AVG(revenue) avg_revenue, AVG(customer_visits) avg_customers
    FROM simulation_days WHERE run_id = ? AND is_weekend = 1
  `).get(runId);

  const topAvailability = db.prepare(`
    SELECT p.product_id, p.name,
      SUM(CASE WHEN e.event_type='SOLD_OUT' THEN 1 ELSE 0 END) stockout_events,
      SUM(CASE WHEN e.event_type='LOW_STOCK' THEN 1 ELSE 0 END) low_stock_events,
      (SELECT COUNT(*) FROM demand_events d
       WHERE d.run_id=p.run_id AND d.product_id=p.product_id AND d.outcome='UNAVAILABLE') unavailable_attempts,
      (SELECT COUNT(*) FROM demand_events d
       WHERE d.run_id=p.run_id AND d.product_id=p.product_id AND d.outcome='PARTIAL') partial_attempts,
      COALESCE((SELECT SUM(d.requested_quantity-d.fulfilled_quantity) FROM demand_events d
       WHERE d.run_id=p.run_id AND d.product_id=p.product_id AND d.outcome IN ('UNAVAILABLE','PARTIAL')),0) unfulfilled_units,
      COALESCE((SELECT SUM(m.quantity) FROM inventory_movements m
       WHERE m.run_id=p.run_id AND m.product_id=p.product_id AND m.movement_type='EXPIRY_WRITE_OFF'),0) expired_units,
      COALESCE((SELECT SUM(m.movement_value) FROM inventory_movements m
       WHERE m.run_id=p.run_id AND m.product_id=p.product_id AND m.movement_type='EXPIRY_WRITE_OFF'),0) writeoff_value,
      COALESCE((SELECT SUM(ti.quantity) FROM transaction_items ti
       WHERE ti.run_id=p.run_id AND ti.product_id=p.product_id),0) units_sold,
      COALESCE((SELECT SUM(ti.line_revenue) FROM transaction_items ti
       WHERE ti.run_id=p.run_id AND ti.product_id=p.product_id),0) revenue
    FROM run_products p
    LEFT JOIN store_brain_events e ON e.run_id=p.run_id AND e.product_id=p.product_id
    WHERE p.run_id=?
    GROUP BY p.product_id, p.name
    ORDER BY stockout_events DESC, unavailable_attempts DESC, low_stock_events DESC, units_sold DESC
    LIMIT 1
  `).get(runId);

  const topWriteoff = db.prepare(`
    SELECT p.product_id, p.name, p.category,
      COALESCE(SUM(CASE WHEN m.movement_type='EXPIRY_WRITE_OFF' THEN m.quantity ELSE 0 END),0) expired_units,
      COALESCE(SUM(CASE WHEN m.movement_type='EXPIRY_WRITE_OFF' THEN m.movement_value ELSE 0 END),0) writeoff_value,
      COALESCE((SELECT SUM(ti.quantity) FROM transaction_items ti WHERE ti.run_id=p.run_id AND ti.product_id=p.product_id),0) units_sold,
      COALESCE((SELECT SUM(ti.line_revenue) FROM transaction_items ti WHERE ti.run_id=p.run_id AND ti.product_id=p.product_id),0) revenue
    FROM run_products p
    LEFT JOIN inventory_movements m ON m.run_id=p.run_id AND m.product_id=p.product_id
    WHERE p.run_id=?
    GROUP BY p.product_id, p.name, p.category
    ORDER BY writeoff_value DESC, expired_units DESC
    LIMIT 1
  `).get(runId);

  const slowMover = db.prepare(`
    WITH movement AS (
      SELECT product_id, SUM(quantity_delta) closing_qty
      FROM inventory_movements WHERE run_id=? GROUP BY product_id
    ), sold AS (
      SELECT product_id, SUM(quantity) units_sold
      FROM transaction_items WHERE run_id=? GROUP BY product_id
    )
    SELECT p.product_id, p.name, p.category,
      COALESCE(m.closing_qty,0) closing_qty,
      COALESCE(s.units_sold,0) units_sold,
      ROUND(COALESCE(m.closing_qty,0)*p.purchase_cost,2) closing_value
    FROM run_products p
    LEFT JOIN movement m ON m.product_id=p.product_id
    LEFT JOIN sold s ON s.product_id=p.product_id
    WHERE p.run_id=?
    ORDER BY (COALESCE(m.closing_qty,0) + 1.0) / (COALESCE(s.units_sold,0) + 1.0) DESC,
             closing_value DESC
    LIMIT 1
  `).get(runId, runId, runId);

  const insert = db.prepare(`
    INSERT INTO commercial_findings (
      run_id, position, title, observation, evidence, diagnosis,
      business_implication, recommendation, limitation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const margin = percent(totals.gross_profit, totals.revenue);
  const weekdayPremium = percent((weekday.avg_revenue || 0) - (weekend.avg_revenue || 0), weekend.avg_revenue || 1);
  insert.run(
    runId,
    1,
    'The simulated store generates a positive trading contribution, led by weekday CBD demand',
    `Across the 60-day ${evidenceRunLabel}, sales produced positive gross profit and operating cash remained above zero. Average weekday revenue was ${weekdayPremium >= 0 ? 'higher' : 'lower'} than average weekend revenue.`,
    `Revenue was A$${round2(totals.revenue).toFixed(2)}, COGS A$${round2(totals.cogs).toFixed(2)} and gross profit A$${round2(totals.gross_profit).toFixed(2)} (${margin.toFixed(1)}% gross margin). Closing operating cash was A$${round2(run.closing_operating_cash).toFixed(2)}. Average weekday revenue was A$${round2(weekday.avg_revenue).toFixed(2)} versus A$${round2(weekend.avg_revenue).toFixed(2)} on weekends.`,
    'Within the model boundary, the product mix and synthetic CBD demand produce positive gross margin while replenishment remains affordable. Closing operating cash is a liquidity measure rather than profit: opening inventory was funded separately, so cash also includes proceeds generated from selling that separately funded opening stock. The weekday/weekend difference is consistent with the modelled office-worker and student mix around the CBD location.',
    'The prototype supports continued development, but neither gross profit nor closing operating cash is equivalent to real-store net profitability. Major fixed operating costs are excluded, and the operating-cash account does not charge the separately funded opening inventory.',
    'Proceed to a calibrated pilot model using observed footfall, conversion and category sales, then add the excluded fixed operating costs before making an investment decision.',
    'Demand is synthetic and the assignment excludes major real-world operating costs, so this result cannot establish real-store net profitability.'
  );

  if (topAvailability && (topAvailability.stockout_events > 0 || topAvailability.unavailable_attempts > 0)) {
    insert.run(
      runId,
      2,
      `Availability pressure is concentrated in ${topAvailability.name}`,
      `${topAvailability.name} recorded the highest sold-out frequency in the ${evidenceRunLabel}, so it is the clearest SKU-level availability problem to investigate.`,
      `${topAvailability.stockout_events} sold-out event(s), ${topAvailability.low_stock_events} low-stock event(s), ${topAvailability.unavailable_attempts} fully unavailable demand attempt(s) and ${topAvailability.unfulfilled_units} unfulfilled unit(s) were recorded. It still sold ${topAvailability.units_sold} units and generated A$${round2(topAvailability.revenue).toFixed(2)} revenue; ${topAvailability.expired_units} unit(s) were also written off (A$${round2(topAvailability.writeoff_value).toFixed(2)}).`,
      'Demand sometimes depleted saleable stock before the next replenishment arrived. Because the product is also perishable, simply raising target stock would trade fewer stockouts for greater expiry exposure; the control problem is timing as well as quantity.',
      'Repeated unavailability can suppress revenue and customer confidence, while excess safety stock can increase waste. The client therefore needs a service-level versus expiry trade-off rather than a one-sided stock increase.',
      'After real demand calibration, trigger replenishment slightly earlier while keeping target cover tight, then compare stockout frequency and expiry write-off together. Prefer smaller, earlier replenishment lots before increasing the overall perishable stock target.',
      'The frequency of simulated stockouts and expiry depends on synthetic demand, the declared substitution probability and the fixed one-day supplier lead time.'
    );
  } else {
    insert.run(
      runId, 2,
      'Availability was maintained without a material stockout pattern',
      `${evidenceRunLabel} did not produce a material recurring stockout problem.`,
      `${topAvailability?.low_stock_events || 0} low-stock event(s) were recorded for the most pressured product, with no material unresolved stockout pattern in the stored history.`,
      'The current days-of-cover and one-day replenishment rules were sufficient for the simulated demand profile.',
      'Service levels appear coherent, although this does not prove the safety stock is optimal.',
      'Retain the current rule as a baseline and stress-test higher footfall and supplier delays before reducing inventory buffers.',
      'A synthetic 60-day run may not expose rare demand spikes or real supplier disruption.'
    );
  }

  if (topWriteoff && topWriteoff.writeoff_value > 0.01) {
    insert.run(
      runId,
      3,
      `Perishable waste is concentrated in ${topWriteoff.name}`,
      `${topWriteoff.name} generated the largest expiry/write-off value among products, creating a clear availability-versus-waste trade-off.`,
      `${topWriteoff.expired_units} unit(s) were written off at a purchase-cost value of A$${round2(topWriteoff.writeoff_value).toFixed(2)}. The same product sold ${topWriteoff.units_sold} units and generated A$${round2(topWriteoff.revenue).toFixed(2)} revenue.`,
      'The product’s shelf life and demand variability make excess cover costly. FEFO prevents expired sales, but it cannot recover value once stock ages beyond demand.',
      'Excess perishable inventory reduces the economic benefit of strong availability and ties up cash in stock that may never generate revenue.',
      'Reduce target days of cover or use smaller replenishment lots for this item, then evaluate whether write-off falls without creating an unacceptable increase in stockouts. A later real-world version could also test markdowns near expiry.',
      'The prototype intentionally does not model markdowns, donations or salvage value, so all expired units are treated as full purchase-cost write-offs.'
    );
  } else {
    insert.run(
      runId,
      3,
      `Working capital is concentrated in slow-moving ${slowMover?.name || 'inventory'}`,
      `${slowMover?.name || 'A slow-moving product'} retains relatively high closing stock compared with its realised 60-day sales.`,
      `${slowMover?.name || 'The product'} closed with ${slowMover?.closing_qty || 0} units (A$${round2(slowMover?.closing_value || 0).toFixed(2)} at purchase cost) after selling ${slowMover?.units_sold || 0} units.`,
      'The opening allocation and target-stock rule are high relative to realised demand for this line, even though the product does not create an integrity failure.',
      'Cash tied in weak inventory could be redirected toward faster-moving products or retained as operating liquidity.',
      'Reduce the opening quantity and target cover for this slow mover in the next model version, while preserving enough stock to observe genuine demand after calibration.',
      'Slow-moving classification is based on the synthetic sales history; a real launch may reveal different demand for infrequently purchased convenience items.'
    );
  }
}
