# Database & Assurance Notes

## Persistent run layers

The database deliberately separates:

1. **Run configuration** — `simulation_runs`, `run_products`, opening `inventory_batches`.
2. **Recorded operating history** — customers, demand events, transactions/items, inventory movements, replenishment orders/items, Store Brain events, cash movements and daily records.
3. **Derived analysis** — `commercial_findings`; report and assurance endpoints recalculate from stored operating history.

This separation avoids treating a displayed report total as primary evidence.

## Inventory event model

`inventory_movements.quantity_delta` is signed:

- opening inventory: positive
- replenishment receipt: positive
- sale: negative
- expiry/write-off: negative

The assurance engine scans the movement ledger in `(day_number, id)` order and rejects any transient balance below zero.

Perishable sales carry a `batch_reference`; assurance joins that reference back to `inventory_batches.expiry_day` and checks `expiry_day > sale_day`.

## Revenue model

Every transaction stores its total, COGS and gross profit. Every line item retains quantity, selling price, cost, line revenue and line COGS.

The report does not trust `simulation_days.revenue` alone: assurance compares each daily figure to `SUM(transactions.total)` and then compares the 60-day sum to all recorded transactions.

## Cash model

Opening operating cash is a Day-0 cash movement of A$15,000. Completed sales create positive `SALE_RECEIPT` movements. Replenishment creates one negative `REPLENISHMENT_PAYMENT` movement when the order is placed.

Assurance checks:

- daily closing cash equation;
- continuity between one day's closing and the next day's opening;
- final 60-day equation;
- last cash-ledger balance vs stored run closing cash;
- each replenishment order's `total_cost <= cash_before`;
- each order's `cash_after = cash_before - total_cost`.

## Completed-history protection

There are no normal API endpoints for updating or deleting historical records. In addition, SQLite triggers in `schema.sql` reject UPDATE/DELETE operations on core history tables once their parent run has status `COMPLETED`.

The completed `simulation_runs` envelope and stored `commercial_findings` are also frozen after completion. Findings are generated before the final status transition, then protected with the rest of the run.

This is intentionally stronger than the assignment's minimum application-level requirement while remaining proportionate to a local SQLite prototype.

## Additional integrity checks

Beyond the three required reconciliations, assurance also verifies:

- transaction headers reconcile to their transaction-item units, revenue, COGS and gross profit and to exactly one matching sale cash receipt;
- each Daily Report's stored customer, transaction, unit, COGS, gross-profit, expiry, replenishment and Store Brain counts reconcile to the underlying ledgers; and
- replenishment order totals reconcile to line items, use a one-day lead time, never originate on Day 60, and match the quantities received on the following day.

These checks make the report hierarchy auditable rather than trusting intermediate summary rows.
