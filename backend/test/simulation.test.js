import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeSchema, openDatabase } from '../src/db.js';
import { initializeRun, runSimulation } from '../src/simulation/engine.js';
import { buildAssurance } from '../src/simulation/assurance.js';
import { buildCommercialReport, buildDailyReport } from '../src/simulation/reports.js';

function withTempDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supermarket-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  const db = openDatabase(dbPath);
  initializeSchema(db);
  try { return fn(db); }
  finally {
    db.close();
    fs.rmSync(dir, { recursive:true, force:true });
  }
}

test('opening configuration respects client financial constraints and product requirements', () => withTempDb(db => {
  const run = initializeRun(db, { seed:111, runCode:'TEST-BUDGET' });
  assert.ok(run.opening_inventory_cost <= 40000);
  assert.equal(run.opening_operating_cash, 15000);
  const products = db.prepare('SELECT * FROM run_products WHERE run_id=?').all(run.id);
  assert.ok(products.length >= 40 && products.length <= 80);
  for (const p of products) {
    assert.ok(p.product_id && p.name && p.category);
    assert.ok(p.purchase_cost >= 0 && p.selling_price >= 0 && p.initial_quantity >= 0);
    assert.ok(p.perishable === 0 || (Number.isInteger(p.shelf_life_days) && p.shelf_life_days > 0));
  }
}));

test('model snapshot stores structured customer, mission and Store Brain assumptions', () => withTempDb(db => {
  const run = initializeRun(db, { seed:112, runCode:'TEST-MODEL' });
  const config = JSON.parse(run.model_config_json);
  const declaration = JSON.parse(run.model_declaration_json);
  assert.equal(config.simulationDays, 60);
  assert.equal(Object.keys(config.customerTypes).length, 5);
  assert.equal(Object.keys(config.shoppingMissions).length, 6);
  assert.equal(Object.keys(config.dayVisitMeans).length, 7);
  assert.equal(Object.keys(config.dayDemandFactors).length, 7);
  assert.equal(config.rules.leadTimeDays, 1);
  for (const key of ['operatingContext','customerActivity','shoppingDemand','perishability','brainDetection','replenishment','cashConstraint','finance','limitations']) {
    assert.ok(String(declaration[key] || '').length > 40, `Missing material Model Declaration text for ${key}`);
  }
}));

test('60-day run completes, orders use one-day lead time, and no Day-60 order is placed', () => withTempDb(db => {
  const run = initializeRun(db, { seed:222, runCode:'TEST-RUN' });
  const completed = runSimulation(db, run.id);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM simulation_days WHERE run_id=?').get(run.id).count, 60);
  const invalidLead = db.prepare('SELECT COUNT(*) count FROM replenishment_orders WHERE run_id=? AND receive_day <> order_day + 1').get(run.id).count;
  const day60Orders = db.prepare('SELECT COUNT(*) count FROM replenishment_orders WHERE run_id=? AND order_day=60').get(run.id).count;
  assert.equal(invalidLead, 0);
  assert.equal(day60Orders, 0);
}));

test('sales obey catalogue, stock and expiry constraints', () => withTempDb(db => {
  const run = initializeRun(db, { seed:223, runCode:'TEST-SALES-INTEGRITY' });
  runSimulation(db, run.id);
  const unknownProducts = db.prepare(`
    SELECT COUNT(*) count FROM transaction_items ti
    LEFT JOIN run_products p ON p.run_id=ti.run_id AND p.product_id=ti.product_id
    WHERE ti.run_id=? AND p.id IS NULL
  `).get(run.id).count;
  assert.equal(unknownProducts, 0);
  const assurance = buildAssurance(db, run.id);
  assert.equal(assurance.summary.inventoryReconciliation.negativeStockIncidents, 0);
  assert.equal(assurance.summary.inventoryReconciliation.oversellingIncidents, 0);
  assert.equal(assurance.summary.inventoryReconciliation.expiredProductSales, 0);
}));

test('commercial assurance passes all required and additional integrity checks', () => withTempDb(db => {
  const run = initializeRun(db, { seed:333, runCode:'TEST-ASSURANCE' });
  runSimulation(db, run.id);
  const assurance = buildAssurance(db, run.id);
  assert.equal(assurance.overallStatus, 'PASS');
  assert.equal(assurance.summary.historyCompleteness.daysRetained, 60);
  assert.equal(assurance.summary.inventoryReconciliation.status, 'PASS');
  assert.equal(assurance.summary.revenueReconciliation.status, 'PASS');
  assert.equal(assurance.summary.cashReconciliation.status, 'PASS');
  assert.equal(assurance.summary.transactionIntegrity.status, 'PASS');
  assert.equal(assurance.summary.dailyReportIntegrity.status, 'PASS');
  assert.equal(assurance.summary.replenishmentIntegrity.status, 'PASS');
  assert.ok(Math.abs(assurance.summary.revenueReconciliation.totalDifference) <= 0.01);
  assert.ok(Math.abs(assurance.summary.cashReconciliation.finalCashDifference) <= 0.01);
}));

test('60-Day Commercial Report and Daily Reports expose the required stored evidence', () => withTempDb(db => {
  const run = initializeRun(db, { seed:334, runCode:'TEST-REPORTS' });
  runSimulation(db, run.id);
  const report = buildCommercialReport(db, run.id);
  const p1 = report.part1BusinessPerformance;
  const p2 = report.part2InventoryOperations;
  assert.equal(p1.dailyActivity.length, 60);
  assert.ok(p1.categoryPerformance.length >= 7);
  assert.ok(p1.categoryPerformance.every(r => 'units_sold' in r && 'revenue' in r && 'gross_profit' in r));
  assert.ok(p1.topProducts.length > 0 && p1.weakProducts.length > 0);
  assert.equal(report.part3CommercialDiagnosis.findings.length, 3);
  assert.ok('cashConstraintEvents' in p2.eventTotals);
  assert.ok(Array.isArray(p2.closingInventory) && p2.closingInventory.length > 0);
  assert.equal(report.part4CommercialAssurance.overallStatus, 'PASS');

  for (const day of [1, 23, 60]) {
    const daily = buildDailyReport(db, run.id, day);
    assert.equal(daily.day.day_number, day);
    assert.ok(Array.isArray(daily.transactions));
    assert.ok(Array.isArray(daily.inventoryMovements));
    assert.ok(Array.isArray(daily.brainEvents));
  }
}));

test('same seed produces the same headline commercial totals', () => withTempDb(db => {
  const a = initializeRun(db, { seed:4444, runCode:'TEST-DETERMINISM-A' });
  const b = initializeRun(db, { seed:4444, runCode:'TEST-DETERMINISM-B' });
  runSimulation(db, a.id);
  runSimulation(db, b.id);
  const stmt = db.prepare(`SELECT ROUND(SUM(revenue),2) revenue, SUM(units_sold) units, ROUND(SUM(expiry_writeoff_value),2) writeoff FROM simulation_days WHERE run_id=?`);
  assert.deepEqual(stmt.get(a.id), stmt.get(b.id));
}));

test('completed run configuration, history and findings are protected from mutation', () => withTempDb(db => {
  const run = initializeRun(db, { seed:555, runCode:'TEST-IMMUTABLE' });
  runSimulation(db, run.id);
  assert.throws(
    () => db.prepare('UPDATE simulation_days SET revenue = revenue + 1 WHERE run_id=? AND day_number=1').run(run.id),
    /immutable/i
  );
  assert.throws(
    () => db.prepare('DELETE FROM transactions WHERE run_id=?').run(run.id),
    /immutable/i
  );
  assert.throws(
    () => db.prepare("UPDATE simulation_runs SET model_config_json='{}' WHERE id=?").run(run.id),
    /immutable/i
  );
  assert.throws(
    () => db.prepare("UPDATE commercial_findings SET evidence='changed' WHERE run_id=? AND position=1").run(run.id),
    /immutable/i
  );
}));

test('completed run stores exactly three complete evidence-based commercial findings', () => withTempDb(db => {
  const run = initializeRun(db, { seed:666, runCode:'TEST-FINDINGS' });
  runSimulation(db, run.id);
  const findings = db.prepare('SELECT * FROM commercial_findings WHERE run_id=? ORDER BY position').all(run.id);
  assert.equal(findings.length, 3);
  for (const finding of findings) {
    assert.ok(finding.observation.length > 20);
    assert.ok(finding.evidence.length > 20);
    assert.ok(finding.diagnosis.length > 20);
    assert.ok(finding.business_implication.length > 20);
    assert.ok(finding.recommendation.length > 20);
    assert.ok(finding.limitation.length > 20);
  }
}));
