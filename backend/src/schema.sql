PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS simulation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('INITIALIZED','RUNNING','COMPLETED')),
  is_submitted INTEGER NOT NULL DEFAULT 0 CHECK (is_submitted IN (0,1)),
  seed INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  simulated_start_date TEXT NOT NULL,
  opening_inventory_budget REAL NOT NULL,
  opening_inventory_cost REAL NOT NULL,
  opening_operating_cash REAL NOT NULL,
  closing_operating_cash REAL,
  model_config_json TEXT NOT NULL,
  model_declaration_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_submitted_run
ON simulation_runs(is_submitted)
WHERE is_submitted = 1;

CREATE TABLE IF NOT EXISTS run_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  pack_size TEXT,
  purchase_cost REAL NOT NULL CHECK (purchase_cost >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
  perishable INTEGER NOT NULL CHECK (perishable IN (0,1)),
  shelf_life_days INTEGER,
  popularity REAL NOT NULL,
  essential_weight REAL NOT NULL DEFAULT 1,
  reorder_days_cover REAL NOT NULL,
  target_days_cover REAL NOT NULL,
  slow_move_days_cover REAL NOT NULL,
  UNIQUE(run_id, product_id),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('OPENING','REPLENISHMENT')),
  source_reference TEXT,
  received_day INTEGER NOT NULL,
  expiry_day INTEGER,
  unit_cost REAL NOT NULL,
  quantity_received INTEGER NOT NULL CHECK (quantity_received >= 0),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS simulation_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 60),
  simulated_date TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  is_weekend INTEGER NOT NULL CHECK (is_weekend IN (0,1)),
  customer_visits INTEGER NOT NULL,
  transactions INTEGER NOT NULL,
  units_sold INTEGER NOT NULL,
  revenue REAL NOT NULL,
  cogs REAL NOT NULL,
  gross_profit REAL NOT NULL,
  expiry_units INTEGER NOT NULL,
  expiry_writeoff_value REAL NOT NULL,
  replenishment_received_units INTEGER NOT NULL,
  replenishment_ordered_units INTEGER NOT NULL,
  replenishment_spend REAL NOT NULL,
  opening_cash REAL NOT NULL,
  closing_cash REAL NOT NULL,
  stockout_events INTEGER NOT NULL,
  low_stock_events INTEGER NOT NULL,
  expiry_warning_events INTEGER NOT NULL,
  slow_moving_events INTEGER NOT NULL,
  cash_constraint_events INTEGER NOT NULL,
  UNIQUE(run_id, day_number),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  customer_code TEXT NOT NULL,
  customer_type TEXT NOT NULL,
  shopping_mission TEXT NOT NULL,
  arrival_period TEXT NOT NULL,
  intended_basket_size INTEGER NOT NULL,
  fulfilled_units INTEGER NOT NULL,
  transaction_id INTEGER,
  UNIQUE(run_id, customer_code),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  transaction_code TEXT NOT NULL,
  customer_code TEXT NOT NULL,
  arrival_period TEXT NOT NULL,
  units INTEGER NOT NULL,
  total REAL NOT NULL,
  cogs REAL NOT NULL,
  gross_profit REAL NOT NULL,
  UNIQUE(run_id, transaction_code),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_sell_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  line_revenue REAL NOT NULL,
  line_cogs REAL NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS demand_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  customer_code TEXT NOT NULL,
  product_id TEXT NOT NULL,
  requested_quantity INTEGER NOT NULL,
  fulfilled_quantity INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('FULFILLED','PARTIAL','UNAVAILABLE','SUBSTITUTED')),
  substitute_product_id TEXT,
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('OPENING','REPLENISHMENT_RECEIPT','SALE','EXPIRY_WRITE_OFF')),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  quantity_delta INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  movement_value REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  batch_reference TEXT,
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS replenishment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  order_code TEXT NOT NULL,
  order_day INTEGER NOT NULL,
  receive_day INTEGER NOT NULL,
  total_cost REAL NOT NULL,
  cash_before REAL NOT NULL,
  cash_after REAL NOT NULL,
  cash_constrained INTEGER NOT NULL CHECK (cash_constrained IN (0,1)),
  rationale TEXT NOT NULL,
  UNIQUE(run_id, order_code),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS replenishment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  run_id INTEGER NOT NULL,
  order_day INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  desired_quantity INTEGER NOT NULL,
  ordered_quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  line_cost REAL NOT NULL,
  priority_score REAL NOT NULL,
  reason TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES replenishment_orders(id),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS store_brain_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('LOW_STOCK','SOLD_OUT','EXPIRY_WARNING','SLOW_MOVING','REPLENISHMENT','CASH_CONSTRAINT')),
  product_id TEXT,
  product_name TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WATCH','HIGH','CRITICAL')),
  condition_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  outcome_text TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('OPENING_CASH','SALE_RECEIPT','REPLENISHMENT_PAYMENT')),
  amount REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  balance_after REAL NOT NULL,
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE TABLE IF NOT EXISTS commercial_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  title TEXT NOT NULL,
  observation TEXT NOT NULL,
  evidence TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  business_implication TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  limitation TEXT NOT NULL,
  UNIQUE(run_id, position),
  FOREIGN KEY (run_id) REFERENCES simulation_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_days_run ON simulation_days(run_id, day_number);
CREATE INDEX IF NOT EXISTS idx_transactions_run_day ON transactions(run_id, day_number);
CREATE INDEX IF NOT EXISTS idx_items_run_product ON transaction_items(run_id, product_id);
CREATE INDEX IF NOT EXISTS idx_items_transaction ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_batches_run_product_reference ON inventory_batches(run_id, product_id, source_reference);
CREATE INDEX IF NOT EXISTS idx_inventory_run_reference ON inventory_movements(run_id, reference_type, reference_id, day_number);
CREATE INDEX IF NOT EXISTS idx_inventory_run_day_product ON inventory_movements(run_id, day_number, product_id);
CREATE INDEX IF NOT EXISTS idx_brain_run_day ON store_brain_events(run_id, day_number);
CREATE INDEX IF NOT EXISTS idx_replenishment_run_day ON replenishment_orders(run_id, order_day);
CREATE INDEX IF NOT EXISTS idx_cash_run_day ON cash_movements(run_id, day_number);
CREATE INDEX IF NOT EXISTS idx_cash_run_reference ON cash_movements(run_id, reference_type, reference_id, movement_type);

-- Application history is append-only once a run is completed. These defensive
-- database triggers backstop the absence of edit/delete API routes.
CREATE TRIGGER IF NOT EXISTS lock_completed_run_products_update
BEFORE UPDATE ON run_products
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_run_products_delete
BEFORE DELETE ON run_products
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_batches_update
BEFORE UPDATE ON inventory_batches
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_batches_delete
BEFORE DELETE ON inventory_batches
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_days_update
BEFORE UPDATE ON simulation_days
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_days_delete
BEFORE DELETE ON simulation_days
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_customers_update
BEFORE UPDATE ON customers
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_customers_delete
BEFORE DELETE ON customers
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_transactions_update
BEFORE UPDATE ON transactions
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_transactions_delete
BEFORE DELETE ON transactions
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_transaction_items_update
BEFORE UPDATE ON transaction_items
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_transaction_items_delete
BEFORE DELETE ON transaction_items
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_demand_events_update
BEFORE UPDATE ON demand_events
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_demand_events_delete
BEFORE DELETE ON demand_events
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_inventory_movements_update
BEFORE UPDATE ON inventory_movements
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_inventory_movements_delete
BEFORE DELETE ON inventory_movements
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_orders_update
BEFORE UPDATE ON replenishment_orders
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_orders_delete
BEFORE DELETE ON replenishment_orders
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_order_items_update
BEFORE UPDATE ON replenishment_items
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_order_items_delete
BEFORE DELETE ON replenishment_items
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_brain_events_update
BEFORE UPDATE ON store_brain_events
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_brain_events_delete
BEFORE DELETE ON store_brain_events
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_cash_movements_update
BEFORE UPDATE ON cash_movements
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_cash_movements_delete
BEFORE DELETE ON cash_movements
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

-- Freeze the completed run envelope and derived commercial findings as well.
-- The transition from RUNNING -> COMPLETED is allowed because OLD.status is not yet COMPLETED.
CREATE TRIGGER IF NOT EXISTS lock_completed_simulation_runs_update
BEFORE UPDATE ON simulation_runs
WHEN OLD.status='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_simulation_runs_delete
BEFORE DELETE ON simulation_runs
WHEN OLD.status='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS lock_completed_findings_update
BEFORE UPDATE ON commercial_findings
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_findings_delete
BEFORE DELETE ON commercial_findings
WHEN (SELECT status FROM simulation_runs WHERE id=OLD.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS lock_completed_findings_insert
BEFORE INSERT ON commercial_findings
WHEN (SELECT status FROM simulation_runs WHERE id=NEW.run_id)='COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed run history is immutable'); END;

