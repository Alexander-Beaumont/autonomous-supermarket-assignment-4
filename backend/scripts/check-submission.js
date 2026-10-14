import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, initializeSchema } from '../src/db.js';
import { buildAssurance } from '../src/simulation/assurance.js';
import { buildCommercialReport } from '../src/simulation/reports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const dbPath = path.join(root, 'backend/data/supermarket.sqlite');
const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass:Boolean(pass), detail });
const parseJson = (value) => {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};

// Submission-package checks that do not require a running web server.
add('README exists', fs.existsSync(path.join(root, 'README.md')), 'README.md');
add('React entry point exists', fs.existsSync(path.join(root, 'frontend/src/App.jsx')), 'frontend/src/App.jsx');
add('Express entry point exists', fs.existsSync(path.join(root, 'backend/src/server.js')), 'backend/src/server.js');
add('Submitted SQLite database exists', fs.existsSync(dbPath), dbPath);

if (fs.existsSync(dbPath)) {
  const db = openDatabase(dbPath);
  initializeSchema(db);
  try {
    const submittedCount = db.prepare('SELECT COUNT(*) count FROM simulation_runs WHERE is_submitted=1').get().count;
    const run = db.prepare('SELECT * FROM simulation_runs WHERE is_submitted=1 LIMIT 1').get();
    add('Exactly one Submitted Run', Boolean(run) && submittedCount === 1, run?.run_code || 'missing');

    if (run) {
      const productRows = db.prepare('SELECT * FROM run_products WHERE run_id=? ORDER BY product_id').all(run.id);
      const productFieldFailures = productRows.filter((p) => !p.product_id || !p.name || !p.category
        || !(Number(p.purchase_cost) > 0) || !(Number(p.selling_price) > Number(p.purchase_cost))
        || Number(p.initial_quantity) < 0
        || ![0,1].includes(Number(p.perishable))
        || (Number(p.perishable) === 1 && !(Number(p.shelf_life_days) > 0)));
      const declaration = parseJson(run.model_declaration_json);
      const config = parseJson(run.model_config_json);
      const requiredDeclarationFields = ['purpose','operatingContext','customerActivity','shoppingDemand','perishability','brainDetection','replenishment','cashConstraint','finance','limitations'];
      const findingRows = db.prepare('SELECT * FROM commercial_findings WHERE run_id=? ORDER BY position').all(run.id);
      const incompleteFindings = findingRows.filter((f) => !f.observation || !f.evidence || !f.diagnosis || !f.business_implication || !f.recommendation || !f.limitation);

      add('Submitted Run completed', run.status === 'COMPLETED', run.status);
      add('Submitted Run configuration is frozen by completion state', run.status === 'COMPLETED' && config.rules?.completedHistoryEditable === false, `editable=${config.rules?.completedHistoryEditable}`);
      add('Opening inventory within A$40,000', Number(run.opening_inventory_cost) <= 40000, `A$${Number(run.opening_inventory_cost).toFixed(2)}`);
      add('Opening operating cash is A$15,000', Number(run.opening_operating_cash) === 15000, `A$${Number(run.opening_operating_cash).toFixed(2)}`);
      add('Product world is plausible in assignment scope', productRows.length >= 40 && productRows.length <= 80, `${productRows.length} products`);
      add('All products contain required commercial/perishability fields', productFieldFailures.length === 0, `${productFieldFailures.length} invalid product row(s)`);
      add('Model Declaration covers every material required assumption', requiredDeclarationFields.every((key) => typeof declaration[key] === 'string' && declaration[key].trim().length > 0), `${requiredDeclarationFields.length} declaration areas`);
      add('Structured customer and shopping model is stored with the run', Object.keys(config.customerTypes || {}).length >= 3 && Object.keys(config.shoppingMissions || {}).length >= 3 && Object.keys(config.dayVisitMeans || {}).length === 7 && Object.keys(config.dayDemandFactors || {}).length === 7, `${Object.keys(config.customerTypes || {}).length} customer types / ${Object.keys(config.shoppingMissions || {}).length} missions / 7 day factors`);

      const dayCount = db.prepare('SELECT COUNT(*) count FROM simulation_days WHERE run_id=?').get(run.id).count;
      add('60/60 days retained', dayCount === 60, `${dayCount}/60 days`);

      const invalidOrders = db.prepare(`
        SELECT COUNT(*) count
        FROM replenishment_orders
        WHERE run_id=? AND (receive_day <> order_day + 1 OR order_day >= 60 OR total_cost > cash_before + 0.005 OR cash_after < -0.005)
      `).get(run.id).count;
      add('Replenishment obeys cash, one-day lead time and Day-60 boundary', invalidOrders === 0, `${invalidOrders} invalid order(s)`);

      add('Exactly three commercial findings', findingRows.length === 3, `${findingRows.length} finding(s)`);
      add('All three findings contain the complete reasoning chain and limitation', findingRows.length === 3 && incompleteFindings.length === 0, `${incompleteFindings.length} incomplete finding(s)`);

      const report = buildCommercialReport(db, run.id);
      const p1 = report.part1BusinessPerformance;
      const p2 = report.part2InventoryOperations;
      add('60-Day Commercial Report contains fixed Part 1 evidence',
        p1.dailyActivity?.length === 60
          && p1.categoryPerformance?.length > 0
          && p1.topProducts?.length > 0
          && p1.weakProducts?.length > 0
          && p1.shopperPerformance?.weekdayWeekend?.length === 2,
        `${p1.dailyActivity?.length || 0} daily rows / ${p1.categoryPerformance?.length || 0} categories`);
      add('60-Day Commercial Report contains fixed Part 2 evidence',
        p2.closingInventory?.length === productRows.length
          && Array.isArray(p2.brainEventSummary)
          && Array.isArray(p2.materialCases)
          && Number.isFinite(Number(p2.totalReplenishmentSpending)),
        `${p2.closingInventory?.length || 0} closing inventory rows / ${p2.materialCases?.length || 0} material cases`);

      const assurance = buildAssurance(db, run.id);
      const requiredAssuranceKeys = [
        'historyCompleteness', 'inventoryReconciliation', 'revenueReconciliation', 'cashReconciliation',
        'transactionIntegrity', 'dailyReportIntegrity', 'replenishmentIntegrity'
      ];
      add('All Commercial Assurance controls pass',
        assurance.overallStatus === 'PASS' && requiredAssuranceKeys.every((key) => assurance.summary[key]?.status === 'PASS'),
        `${assurance.overallStatus}; ${requiredAssuranceKeys.length} control groups`);
    }
  } finally {
    db.close();
  }
}

for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
const failures = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failures.length}/${checks.length} submission checks passed.`);
if (failures.length) process.exitCode = 1;
