# Autonomous Supermarket — Simulation, Intelligent Operations & Commercial Assurance

**CSE3CWA / CSE5006 · Assignment 4 · Semester 2, 2026**

A full-stack prototype for a fictional small autonomous supermarket near Swanston Street / Melbourne Town Hall. The application constructs a plausible supermarket world, operates it for 60 consecutive simulated days, autonomously manages inventory and replenishment, and presents client-facing commercial analysis with traceable assurance checks.

The submitted database already contains the completed **Submitted Run `SUBMITTED-RUN-2026-01`**. The application opens on this run by default.

## Technology stack

- **Frontend:** React 18, React Router, Recharts, Vite
- **Backend:** Node.js + Express
- **Persistent storage:** SQLite
- **SQLite runtime:** `better-sqlite3` when available, with Node's built-in `node:sqlite` as a zero-native-dependency fallback
- **Testing:** Node's built-in test runner

No cloud services, API keys, external database, authentication service or `.env` file are required.

---

## Run the project from a clean copy

### Requirements

- Node.js **22.5 or newer** (Node 22 LTS or newer recommended; this guarantees the built-in SQLite fallback)
- npm **10 or newer**

Dependency versions are pinned in the package manifests to reduce install-time variation.

### 1. Install dependencies

From the project root:

```bash
npm install
```

The root `postinstall` script installs the backend and frontend dependencies as well.

### 2. Start the complete application

```bash
npm run dev
```

Open the **Local** URL printed by Vite. On a clean machine this is normally:

```text
http://localhost:5173
```

If port 5173 is already in use, Vite automatically selects the next available port (for example `http://localhost:5174`).

The Express API runs on:

```text
http://localhost:3001
```

Vite proxies `/api` requests to the Express backend.

### 3. Optional automated verification

```bash
npm test
```

The automated suite contains **9 tests** covering opening/product constraints, frozen model assumptions, the 60-day operating cycle, catalogue/stock/expiry sales integrity, required and extended Commercial Assurance, report/Daily Report evidence, seeded repeatability, completed-history immutability and the three stored commercial findings. The separate `npm run check-submission` command performs 20 package-and-evidence checks against the packaged database.

For a single pre-submission command after dependencies are installed, run:

```bash
npm run verify
```

This runs the automated tests, submission self-check and a production frontend build.

---

## Submitted Run

The SQLite database is stored at:

```text
backend/data/supermarket.sqlite
```

The assessment evidence run is:

```text
Run ID: SUBMITTED-RUN-2026-01
Seed: 26092026
Status: COMPLETED
Simulation days: 60 / 60
Opening inventory cost: A$19,671.00
Opening operating cash: A$15,000.00
```

The Submitted Run is already present when the marker starts the application. Its configuration and operating history are frozen. Historical product configuration, customers, transactions, transaction items, demand attempts, inventory batches/movements, replenishment orders, Store Brain events, daily records and cash movements have no edit/delete API route. SQLite triggers also reject update/delete attempts against completed-run history.

To test the simulation without changing the Submitted Run, open **New Simulation** in the website, initialise a new run, then execute it. Each new run receives its own Run ID and stored history.

For development only, the packaged Submitted Run can be recreated with:

```bash
npm run reseed
```

`reseed` intentionally replaces the local development database and should not be used when inspecting the packaged assessment evidence.

---

## Architecture and data flow

```text
Frozen model configuration
  ├─ product catalogue + opening inventory
  ├─ customer types + shopping missions
  ├─ demand weights + weekday/weekend activity
  └─ Store Brain rules
             │
             ▼
      60-day simulation engine
             │
   ┌─────────┼───────────────────────────────┐
   │         │                               │
   ▼         ▼                               ▼
Customers  Transactions                 Inventory batches
   │         │                               │
   │         ├─ transaction items            ├─ receipts
   │         ├─ revenue / COGS               ├─ FEFO sales
   │         └─ cash receipts                └─ expiry write-offs
   │                                             │
   └──────────────► Store Brain ◄────────────────┘
                     │
                     ├─ low-stock / sold-out detection
                     ├─ expiry warnings
                     ├─ slow-moving detection
                     ├─ prioritised replenishment
                     └─ available-cash constraint
                              │
                              ▼
                         SQLite history
                              │
             ┌────────────────┼──────────────────┐
             ▼                ▼                  ▼
       60-Day Report     Daily Reports     Assurance engine
             │                │                  │
             └────────────────┴─────────────► React UI
```

### Daily operating cycle

Each day executes in the assignment-specified order:

1. Receive replenishment ordered at the end of the previous day.
2. Remove stock that has reached expiry before customers arrive.
3. Generate structured customer shopping visits and baskets.
4. Complete sales only from available, non-expired inventory.
5. Record transactions, COGS, inventory movements and sales cash.
6. Run the closing Store Brain review.
7. Detect sold out, low stock, near expiry and slow-moving conditions.
8. Prioritise and place affordable replenishment orders.
9. Deduct order cost immediately; ordered stock is available the following day.
10. Store the complete Daily Report evidence.

No replenishment order is placed after Day 60 because there is no Day 61 within the model horizon.

---

## Supermarket world and demand model

The Submitted Run contains **60 products across eight categories**:

- Grocery & Pantry
- Drinks
- Snacks & Confectionery
- Dairy & Chilled
- Fresh & Bakery
- Ready-to-Eat
- Household Essentials
- Personal & Convenience

Each run snapshots product ID, name/pack specification, category, purchase cost, selling price, opening quantity, perishability, shelf life and Store Brain control parameters.

The A$40,000 opening-inventory amount is treated as a **maximum**, not a target. The Submitted Run uses A$19,671.00 of that allowance to provide a practical dry-grocery buffer while deliberately limiting short-shelf-life opening stock. The unused inventory allowance does **not** become operating cash. Operating cash begins separately at the fixed A$15,000 required by the brief.

### Customer structure

Customer records represent **shopping visits**, not all CBD pedestrians, so the model does not introduce a separate passer-by conversion funnel. Five shopper types are used:

- Office Worker
- Student
- CBD Resident
- Tourist
- Convenience Shopper

Their relative mix changes between weekdays and weekends. The frozen run configuration also stores all seven day-of-week visit means and day demand factors used by the simulation. Each shopping visit receives one of six shopping missions:

- Quick Lunch
- Snack & Drink
- Breakfast
- Top-Up Grocery
- Dinner Convenience
- Household Top-Up

The mission controls basket-size range, category preference and time-of-day tendency. Product choice then combines:

```text
shopping-mission category weight
× customer-type category affinity
× product popularity
× small seeded stochastic variation
```

This creates meaningful structured demand rather than uniform random product selection. When an intended product is unavailable, the model may substitute an in-stock product from the same category with a declared 35% probability. The original demand attempt is still retained for audit.

### Perishable inventory

Perishable stock is tracked by batch. Opening perishable inventory is split across staggered remaining shelf life to represent stock already on shelf at Day 1. Replenishment receives the full declared shelf life.

Before customers arrive, batches that have reached expiry are written off. Sales allocate stock using **FEFO (First Expiring, First Out)** so the earliest-expiring valid batch is sold first. Expired units cannot be sold.

---

## Autonomous Store Brain

The Store Brain is intentionally **rule based, explainable and auditable**. It does not use machine learning.

At each day-end it evaluates every product using current stock, recent sales velocity, days of cover, product-specific control settings, shelf-life exposure, essentiality and margin.

It can identify and respond to:

- **Low stock:** current inventory is at/below a dynamic reorder point based on recent sales and required days of cover.
- **Sold out:** zero saleable units; this receives the highest replenishment urgency.
- **Expiry:** near-expiry batches are identified for manager visibility and FEFO handling. High near-expiry exposure can suppress routine replenishment.
- **Slow moving:** stock cover is high relative to observed sales after a minimum history period; routine reorder is held.
- **Replenishment:** low/sold-out products are ranked and moved toward a target days-of-cover level.
- **Cash constraint:** desired orders are allocated in priority order and may be partially filled/deferred; spending can never exceed operating cash available when the order is placed.

Priority uses materially different operating conditions rather than one fixed reorder quantity. Sold-out status, days-of-cover urgency, observed demand, product essentiality and margin all contribute to the recorded priority score.

Every Store Brain record includes the detected **condition**, chosen **action**, recorded **outcome** and supporting metrics. The website exposes this evidence in both the Store Brain view and relevant Daily Report.

---

## Commercial reporting

The website is the primary report. The **60-Day Commercial Report** contains all four fixed client acceptance sections:

### Part 1 — Business Performance

Includes total customers, transactions, units sold, sales revenue, COGS, gross profit, expiry/write-off value, closing operating cash, closing inventory value, average customers/day, weekday/weekend comparison, average basket size, average transaction value, customer activity, category performance, top sellers and weak sellers.

### Part 2 — Inventory & Autonomous Operations

Includes stockouts, low-stock events, expiry/write-off, slow-moving stock, replenishment quantities/spending, closing inventory, Store Brain responses and cash-constraint events. If a required event type did not occur, the report displays **zero** rather than omitting it.

### Part 3 — Commercial Diagnosis & Management Recommendations

Exactly three material findings are generated from the stored Submitted Run evidence. Every finding follows:

```text
Observation → Evidence → Diagnosis → Business implication → Recommendation
```

Each also includes a material model limitation. The Submitted Run includes both operational problems/trade-offs and favourable commercial evidence rather than three positive restatements.

### Part 4 — Commercial Assurance

Provides a report-level assurance summary and links to the detailed Commercial Assurance view.

---

## Daily Reports and traceability

The **Daily Reports** view provides one reusable selector for Days 1–60. Each day exposes:

- customer visits and customer mix;
- transactions and line items;
- units, revenue, COGS and gross profit;
- demand outcomes, including unavailable/substituted attempts;
- replenishment receipts and orders;
- expiry/write-off movements;
- low stock, sold out, expiry and slow-mover Store Brain records;
- opening/closing cash; and
- the day’s inventory movement ledger and closing stock.

The additional **Audit Explorer** provides a direct traceability path:

- product names in the 60-Day Report link directly to that product's audit ledger;
- select any product to reconstruct its full inventory balance from opening stock through receipts, sales and write-offs; or
- follow the trace link on a Daily Report transaction (or enter its code manually) to reconcile line revenue/COGS with inventory decrements and the recorded cash receipt.

---

## Commercial Assurance implementation

The assurance engine recomputes its checks from stored history; the PASS indicators are not hard-coded.

### History completeness

Confirms the run is completed and retains 60/60 Daily Reports plus transaction, inventory, replenishment, Store Brain and cash records.

### Inventory reconciliation

For every product:

```text
opening stock
+ replenishment received
− units sold
− units expired / written off
= closing stock
```

The engine also scans the ordered inventory ledger for any transient negative balance and checks whether any sale references a batch that had already reached expiry.

### Revenue reconciliation

For each day:

```text
daily reported revenue = Σ recorded transaction totals
```

Then:

```text
60-day reported revenue = Σ Days 1–60 revenue
                         = Σ all recorded transaction totals
```

### Operating-cash reconciliation

For each day and the complete run:

```text
closing operating cash
= opening operating cash
+ sales revenue
− replenishment spending
```

Each replenishment order is separately checked to confirm:

```text
order cost ≤ cash available when the order was placed
cash after = cash before − order cost
```

### Additional integrity controls

The prototype also performs three stronger cross-checks beyond the minimum client equations:

- every transaction header (units, revenue, COGS and gross profit) must reconcile to its stored line items and exactly one matching sale cash receipt;
- every Daily Report roll-up must reconcile to underlying customer, transaction, inventory and Store Brain records; and
- every replenishment order must reconcile to its line items, obey the one-day lead time and Day-60 rule, and match the quantity actually received.

Any material contradiction is returned as a FAIL exception and displayed in the website. Legitimate business outcomes such as stockouts, cash-constrained ordering or expiry do not cause an integrity FAIL by themselves.

---

## Submitted Run snapshot

The website should be used for the complete evidence. The following figures are included here only to identify the packaged run and make marker verification easier:

| Measure | Submitted Run |
|---|---:|
| Run ID | `SUBMITTED-RUN-2026-01` |
| Days retained | 60 / 60 |
| Customer visits | 8,243 |
| Transactions | 8,236 |
| Units sold | 30,356 |
| Sales revenue | A$140,692.00 |
| COGS | A$84,789.60 |
| Gross profit | A$55,902.40 |
| Expiry/write-off value | A$396.65 |
| Replenishment spending | A$69,315.05 |
| Closing operating cash | A$86,376.95 |
| Closing inventory value | A$3,799.80 |
| Commercial Assurance | **PASS** |

The stored database contains thousands of underlying evidence records, including 8,236 transactions, 27,188 transaction items, 28,315 inventory movements, 58 replenishment orders, 921 replenishment line items, 2,282 Store Brain events and 8,295 cash movements.

---

## Where the marker can find required evidence

| Requirement | Website location |
|---|---|
| Submitted Run / Run ID | Top run ribbon on every page; Executive Overview |
| Opening inventory budget / operating cash | **Model & Setup** |
| Product data and perishability | **Model & Setup → Product catalogue** |
| Model Declaration | **Model & Setup → Model Declaration** |
| 60-Day Commercial Report | **60-Day Report** |
| Part 1 Business Performance | **60-Day Report → Part 1** |
| Part 2 Inventory & Store Brain | **60-Day Report → Part 2** |
| Three findings / diagnoses / recommendations | **60-Day Report → Part 3** |
| Commercial Assurance summary | **60-Day Report → Part 4** |
| Full inventory/revenue/cash reconciliation | **Commercial Assurance** |
| Daily Reports Days 1–60 | **Daily Reports** |
| Store Brain decisions and alerts | **Store Brain** and **Daily Reports** |
| Product/transaction traceability | **Audit Explorer** |
| Create an additional run | **New Simulation** |

---

## AI-assisted collaboration

**AI tool used:** ChatGPT (OpenAI).

ChatGPT was used in accordance with the assignment brief to assist with:

- architecture and database-schema drafting;
- initial product-catalogue drafting;
- customer/demand modelling ideas;
- simulation and Store Brain implementation;
- React UI implementation;
- debugging and automated test design;
- commercial-analysis wording; and
- README/documentation drafting.

AI output was **not accepted without review**. Important examples of review and correction include:

1. **Expiry/replenishment logic was corrected.** An early Store Brain draft treated any near-expiry stock as a reason to block replenishment. For very short-shelf-life products this created an unrealistic repeated stockout pattern because virtually all valid stock was always inside the warning window. The final rule still reports near-expiry inventory but blocks reorder only when the quantity at expiry risk materially exceeds expected short-term demand.
2. **Product economics were recalibrated.** Initial draft purchase costs produced an unrealistically high aggregate gross margin of roughly 50%. Purchase costs were reviewed upward so the Submitted Run produces an approximately 40% gross margin, which is more defensible for the fictional CBD small-supermarket/convenience format while remaining a modelling assumption rather than claimed real IGA data.
3. **Opening inventory was changed after reviewing simulation behaviour.** The first draft used only about A$7,000 of the A$40,000 maximum and created an unnecessarily thin dry-goods opening position. Non-perishable opening quantities were increased while short-life perishables remained deliberately tighter. The final Submitted Run uses A$19,671.00 and remains comfortably inside the client constraint.
4. **Assurance was implemented as computation rather than presentation.** PASS/FAIL states are generated by reconciling stored records. Automated tests verify the equations, negative-stock/expired-sale checks, one-day lead time, Day-60 rule and completed-history immutability.

Responsibility for the final modelling choices, testing, interpretation and submitted claims remains with the student. A complete prompt history is not required by the brief and is not included.

---

## Known technical and modelling limitations

- The customer/demand model is synthetic because the proposed store has no operating history. Real footfall and transaction data are required for calibration and external validation.
- Customer records represent shopping visits; pedestrian footfall and conversion are outside the model.
- Supplier lead time is fixed at one day. Supplier delays, partial supplier fulfilment and wholesale availability shocks are not modelled.
- Product purchase costs and selling prices are fixed during a run. Price elasticity, promotions and supplier-price changes are outside scope.
- Markdown, donation and salvage strategies are not modelled. Expired inventory is written off at acquisition cost.
- Premises, rent, fit-out, refrigeration, utilities, insurance, autonomous-store hardware and corporate overhead are outside the client-defined model boundary. Gross profit therefore must not be interpreted as net store profit.
- There is no machine learning or advanced optimisation. The Store Brain is rule based by design so its decisions remain transparent and explainable.
- SQLite is appropriate for this local assessment prototype, not a proposed production architecture for a commercial multi-store deployment.

---

## Project structure

```text
autonomous-supermarket/
├── README.md
├── package.json
├── backend/
│   ├── data/
│   │   └── supermarket.sqlite        # includes the Submitted Run
│   ├── scripts/
│   │   ├── seed-submitted-run.js
│   │   └── check-submission.js
│   ├── src/
│   │   ├── routes/
│   │   ├── simulation/
│   │   │   ├── engine.js
│   │   │   ├── brain.js
│   │   │   ├── reports.js
│   │   │   ├── assurance.js
│   │   │   └── findings.js
│   │   ├── catalog.js
│   │   ├── model.js
│   │   ├── schema.sql
│   │   ├── db.js
│   │   └── server.js
│   └── test/
│       └── simulation.test.js
├── docs/
│   ├── ASSESSMENT_TRACEABILITY.md
│   └── DATABASE_AND_ASSURANCE_NOTES.md
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── App.jsx
    │   ├── api.js
    │   └── styles.css
    ├── index.html
    └── vite.config.js
```

## Troubleshooting

**Port 5173 is already in use:** use the alternate Local URL printed by Vite (for example port 5174), or stop the other Vite process and restart.

**Port 3001 is already in use:** stop the conflicting API process. The supplied Vite proxy expects the backend on port 3001.

**Native SQLite install problem:** Node 22.5+ can use the built-in `node:sqlite` fallback even if the optional `better-sqlite3` native package is unavailable.

**The Submitted Run is missing:** confirm `backend/data/supermarket.sqlite` is present in the extracted ZIP. Do not run `npm run reseed` unless intentionally recreating the development database.

---

This prototype is an educational simulation and is not affiliated with IGA or based on IGA internal data.
