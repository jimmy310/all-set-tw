-- Additive personal balance-sheet foundation. Existing position and history rows
-- remain in place; legacy positions are intentionally not assigned a guessed account.
CREATE TABLE investment_accounts (
  id TEXT NOT NULL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('brokerage', 'sub_brokerage', 'securities_finance', 'other')),
  display_name TEXT NOT NULL,
  masked_identity TEXT,
  currency TEXT NOT NULL DEFAULT 'TWD',
  market TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, source_id)
);
CREATE INDEX idx_investment_accounts_provider ON investment_accounts (provider, account_type);

-- Rebuild the constrained table by copying every legacy column before swapping
-- it, so the allowed asset-type set can grow without losing TDCC observations.
CREATE TABLE investment_positions_v2 (
  id TEXT NOT NULL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'etf', 'fund', 'bond', 'option', 'cash', 'future', 'crypto', 'other')),
  symbol TEXT,
  name TEXT NOT NULL,
  quantity REAL,
  market_value INTEGER,
  cash_balance INTEGER,
  currency TEXT NOT NULL DEFAULT 'TWD',
  as_of_date TEXT NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  investment_account_id TEXT REFERENCES investment_accounts(id) ON DELETE SET NULL,
  custody_status TEXT NOT NULL DEFAULT 'free' CHECK (custody_status IN ('free', 'collateral', 'margin', 'restricted')),
  average_cost REAL,
  cost_basis INTEGER,
  valuation_source TEXT NOT NULL DEFAULT 'source',
  UNIQUE (connector_id, source_id, as_of_date)
);
INSERT INTO investment_positions_v2 (
  id, connector_id, source_id, asset_type, symbol, name, quantity,
  market_value, cash_balance, currency, as_of_date, raw_payload,
  created_at, updated_at
)
SELECT id, connector_id, source_id, asset_type, symbol, name, quantity,
       market_value, cash_balance, currency, as_of_date, raw_payload,
       created_at, updated_at
FROM investment_positions;
DROP TABLE investment_positions;
ALTER TABLE investment_positions_v2 RENAME TO investment_positions;
CREATE INDEX idx_investment_positions_page
  ON investment_positions (as_of_date DESC, asset_type ASC, name ASC, id ASC);
CREATE INDEX idx_investment_positions_latest_scope
  ON investment_positions (connector_id, asset_type, as_of_date DESC);
CREATE INDEX idx_investment_positions_asset_type ON investment_positions (asset_type);
CREATE INDEX idx_investment_positions_as_of_date ON investment_positions (as_of_date);
CREATE INDEX idx_investment_positions_account_date ON investment_positions (investment_account_id, as_of_date DESC);

CREATE TABLE liability_accounts (
  id TEXT NOT NULL PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'connector')),
  connector_id TEXT,
  source_id TEXT,
  liability_type TEXT NOT NULL CHECK (liability_type IN ('mortgage', 'personal_loan', 'securities_backed_loan', 'margin', 'credit_card', 'auto_loan', 'other')),
  provider TEXT,
  name TEXT NOT NULL,
  masked_identity TEXT,
  currency TEXT NOT NULL DEFAULT 'TWD',
  original_principal INTEGER,
  interest_rate REAL,
  interest_rate_type TEXT CHECK (interest_rate_type IS NULL OR interest_rate_type IN ('fixed', 'variable', 'unknown')),
  start_date TEXT,
  maturity_date TEXT,
  monthly_payment INTEGER,
  next_payment_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((source_type = 'manual' AND connector_id IS NULL AND source_id IS NULL) OR (source_type = 'connector' AND connector_id IS NOT NULL AND source_id IS NOT NULL)),
  UNIQUE (connector_id, source_id)
);
CREATE INDEX idx_liability_accounts_type ON liability_accounts (liability_type, updated_at DESC);

CREATE TABLE liability_balance_snapshots (
  id TEXT NOT NULL PRIMARY KEY,
  liability_account_id TEXT NOT NULL REFERENCES liability_accounts(id) ON DELETE CASCADE,
  outstanding_principal INTEGER,
  accrued_interest INTEGER,
  as_of_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'connector', 'reconstructed')),
  created_at TEXT NOT NULL,
  UNIQUE (liability_account_id, as_of_at)
);
CREATE INDEX idx_liability_balance_snapshots_latest ON liability_balance_snapshots (liability_account_id, as_of_at DESC);

CREATE TABLE collateral_relationships (
  id TEXT NOT NULL PRIMARY KEY,
  liability_account_id TEXT NOT NULL REFERENCES liability_accounts(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('investment_position', 'manual_asset', 'bank_account', 'other')),
  asset_id TEXT NOT NULL,
  collateral_value INTEGER,
  currency TEXT NOT NULL DEFAULT 'TWD',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (liability_account_id, asset_type, asset_id)
);
CREATE INDEX idx_collateral_relationships_asset ON collateral_relationships (asset_type, asset_id);
