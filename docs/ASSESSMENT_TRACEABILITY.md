# Assessment Requirement Traceability

This file is a technical index only. The website remains the primary client-facing report.

## A. Full-Stack System — 15 marks

| Criterion | Implementation evidence |
|---|---|
| React + Node/Express operate as one usable application; persistent data stored/retrieved | `frontend/`, `backend/src/server.js`, `backend/src/routes/runs.js`, SQLite `backend/data/supermarket.sqlite` |
| 60-day simulation, run management, reports and daily views reliable | `backend/src/simulation/engine.js`; **New Simulation**, **60-Day Report**, **Daily Reports** |
| Clear, maintainable architecture; README-only startup | `README.md`, separated engine/brain/report/assurance modules, root npm scripts |

## B. Simulated Supermarket World — 20 marks

| Criterion | Implementation evidence |
|---|---|
| Plausible products/categories/prices/inventory/perishability | 60 products in `backend/src/catalog.js`; **Model & Setup** |
| Meaningful customer/shopping/demand structure | five customer types, six shopping missions, weekday/weekend mix, time periods, category affinity, product popularity, substitution — `backend/src/model.js` and `engine.js` |
| 60-day evidence consistent with declared model | frozen run configuration + seeded simulation + stored demand/transaction/inventory history; **Model Declaration**, **Daily Reports** |

## C. Autonomous Store Brain — 20 marks

| Criterion | Implementation evidence |
|---|---|
| Detects low stock, sold out, expiry, slow moving | `backend/src/simulation/brain.js`; **Store Brain** |
| Replenishment uses store data, available cash, one-day lead time | dynamic days-of-cover, priority scores, cash allocation, order Day N → receipt Day N+1; no order after Day 60 |
| Explainable alerts/actions consistent with evidence | every event stores condition/action/outcome/metrics; **Store Brain**, **Daily Reports**, **Audit Explorer** |

## D. Commercial Analysis & Diagnosis — 25 marks

| Criterion | Implementation evidence |
|---|---|
| 60-Day Report explains overall performance | **60-Day Report → Part 1** with KPI, 60-day revenue/customer trends, weekday/weekend comparison, customer-type evidence, and category units/revenue/gross-profit evidence |
| Inventory/operations interpreted including problems/trade-offs | **Part 2** with material Store Brain cases, stockout/expiry/slow-mover/replenishment evidence |
| Three material findings use required chain | `commercial_findings` and **Part 3** explicitly display Observation → Evidence → Diagnosis → Business implication → Recommendation |
| Recommendations commercially relevant and qualified | each finding includes a practical next step plus a material model limitation |

## E. Commercial Assurance & Auditability — 15 marks

| Criterion | Implementation evidence |
|---|---|
| Completed history retained as identifiable non-editable record | Submitted Run ID, no edit/delete APIs, SQLite immutability triggers in `schema.sql` |
| 60-day totals and Daily Reports trace to same history | all routes require one `run_id`; selected run ribbon; report/day/audit APIs use same run |
| Inventory/revenue/cash reconciliations correct | `backend/src/simulation/assurance.js`; **Commercial Assurance**; plus transaction-line, Daily Report roll-up and replenishment-mechanics cross-checks |
| Integrity failures/material exceptions disclosed | assurance engine builds explicit FAIL exceptions; UI shows PASS/FAIL rather than hiding contradictions |
| Selected day/figure/product traceable through website | **Daily Reports** + **Audit Explorer** product ledger and transaction trace |

## F. Client Communication — 5 marks

| Criterion | Implementation evidence |
|---|---|
| Website concise and remote-manager usable | Executive Overview, fixed four-part report, restrained chart set, evidence drill-downs |
| README accurate/efficient | root `README.md`; exact install/run steps, model, architecture, AI collaboration, limitations, required-view index |

## Integrity gates

- `npm run check-submission` verifies the packaged Submitted Run exists, has 60/60 days, obeys opening cash/inventory constraints, has no Day-60 order, contains exactly three findings and passes Commercial Assurance.
- `npm test` runs 9 automated tests covering model/product constraints, simulation rules, sales integrity, reconciliation, report evidence, deterministic test behaviour and completed-run immutability.
- `npm run verify` additionally runs the packaged submission checks and a production frontend build.
