import express from 'express';
import { initializeRun, runSimulation } from '../simulation/engine.js';
import {
  buildCommercialReport,
  buildDailyReport,
  buildModelView,
  buildProductAudit,
  buildStoreBrainView,
  buildTransactionAudit,
  getRunSummary
} from '../simulation/reports.js';
import { buildAssurance } from '../simulation/assurance.js';

export function createRunsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT id, run_code, status, is_submitted, seed, engine_version, created_at,
             started_at, completed_at, simulated_start_date, opening_inventory_cost,
             opening_inventory_budget, opening_operating_cash, closing_operating_cash
      FROM simulation_runs
      ORDER BY is_submitted DESC, id DESC
    `).all().map(row => ({ ...row, is_submitted:Boolean(row.is_submitted) }));
    res.json(rows);
  });

  router.get('/submitted', (req, res) => {
    const run = db.prepare(`SELECT * FROM simulation_runs WHERE is_submitted=1 LIMIT 1`).get();
    if (!run) return res.status(404).json({ error:'No Submitted Run is stored in the database.' });
    return res.json({ ...run, is_submitted:true });
  });

  router.post('/initialize', (req, res, next) => {
    try {
      const requestedSeed = req.body?.seed;
      const seed = Number.isFinite(Number(requestedSeed)) && Number(requestedSeed) > 0
        ? Math.floor(Number(requestedSeed))
        : Math.floor(Math.random() * 2_000_000_000) + 1;
      const run = initializeRun(db, { seed });
      res.status(201).json(run);
    } catch (error) { next(error); }
  });

  router.post('/:id/run', (req, res, next) => {
    try {
      const result = runSimulation(db, Number(req.params.id));
      res.json(result);
    } catch (error) { next(error); }
  });

  router.get('/:id/summary', (req, res, next) => {
    try { res.json(getRunSummary(db, Number(req.params.id))); }
    catch (error) { next(error); }
  });

  router.get('/:id/model', (req, res, next) => {
    try { res.json(buildModelView(db, Number(req.params.id))); }
    catch (error) { next(error); }
  });

  router.get('/:id/report', (req, res, next) => {
    try { res.json(buildCommercialReport(db, Number(req.params.id))); }
    catch (error) { next(error); }
  });

  router.get('/:id/days/:day', (req, res, next) => {
    try {
      const day = Number(req.params.day);
      if (!Number.isInteger(day) || day < 1 || day > 60) return res.status(400).json({ error:'Day must be an integer from 1 to 60.' });
      res.json(buildDailyReport(db, Number(req.params.id), day));
    } catch (error) { next(error); }
  });

  router.get('/:id/brain', (req, res, next) => {
    try { res.json(buildStoreBrainView(db, Number(req.params.id))); }
    catch (error) { next(error); }
  });

  router.get('/:id/assurance', (req, res, next) => {
    try { res.json(buildAssurance(db, Number(req.params.id))); }
    catch (error) { next(error); }
  });

  router.get('/:id/audit/product/:productId', (req, res, next) => {
    try { res.json(buildProductAudit(db, Number(req.params.id), req.params.productId)); }
    catch (error) { next(error); }
  });

  router.get('/:id/audit/transaction/:transactionCode', (req, res, next) => {
    try { res.json(buildTransactionAudit(db, Number(req.params.id), req.params.transactionCode)); }
    catch (error) { next(error); }
  });

  return router;
}
