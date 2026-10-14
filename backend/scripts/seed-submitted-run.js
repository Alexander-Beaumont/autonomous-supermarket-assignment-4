import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeSchema, openDatabase } from '../src/db.js';
import { initializeRun, runSimulation } from '../src/simulation/engine.js';
import { buildAssurance } from '../src/simulation/assurance.js';
import { getRunSummary } from '../src/simulation/reports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/supermarket.sqlite');

for (const suffix of ['', '-wal', '-shm']) {
  const target = `${dbPath}${suffix}`;
  if (fs.existsSync(target)) fs.rmSync(target, { force:true });
}

const db = openDatabase(dbPath);
initializeSchema(db);

try {
  const initialized = initializeRun(db, {
    seed: 26092026,
    runCode:'SUBMITTED-RUN-2026-01',
    isSubmitted:true
  });
  console.log(`Initialised ${initialized.run_code}. Running 60-day simulation...`);
  const completed = runSimulation(db, initialized.id);
  const assurance = buildAssurance(db, completed.id);
  const summary = getRunSummary(db, completed.id);

  console.log('\nSubmitted Run created successfully');
  console.log(`Run ID: ${completed.run_code}`);
  console.log(`Opening inventory cost: A$${summary.run.opening_inventory_cost.toFixed(2)}`);
  console.log(`Revenue: A$${summary.totals.revenue.toFixed(2)}`);
  console.log(`Gross profit: A$${summary.totals.gross_profit.toFixed(2)}`);
  console.log(`Closing operating cash: A$${summary.totals.closing_operating_cash.toFixed(2)}`);
  console.log(`Closing inventory value: A$${summary.totals.closing_inventory_value.toFixed(2)}`);
  console.log(`Commercial Assurance: ${assurance.overallStatus}`);

  if (assurance.overallStatus !== 'PASS') {
    console.error(assurance.exceptions);
    process.exitCode = 1;
  }
} finally {
  db.close();
}
