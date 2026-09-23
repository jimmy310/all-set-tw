-- Explicitly extend manual/provider position metadata without rewriting any
-- existing TDCC observation. Integer market_value remains total position value
-- in whole currency units; option_mark_price retains source/manual unit marks.
ALTER TABLE investment_positions ADD COLUMN underlying_symbol TEXT;
ALTER TABLE investment_positions ADD COLUMN expiration_date TEXT;
ALTER TABLE investment_positions ADD COLUMN strike_price REAL;
ALTER TABLE investment_positions ADD COLUMN option_right TEXT CHECK (option_right IS NULL OR option_right IN ('call', 'put'));
ALTER TABLE investment_positions ADD COLUMN contract_multiplier REAL NOT NULL DEFAULT 1 CHECK (contract_multiplier > 0);
ALTER TABLE investment_positions ADD COLUMN contract_symbol TEXT;
ALTER TABLE investment_positions ADD COLUMN option_mark_price REAL;
ALTER TABLE investment_positions ADD COLUMN economic_security_id TEXT;
ALTER TABLE investment_positions ADD COLUMN observation_coverage TEXT NOT NULL DEFAULT 'complete' CHECK (observation_coverage IN ('complete', 'subset'));
CREATE INDEX idx_investment_positions_economic_security ON investment_positions (economic_security_id, as_of_date DESC);

-- Transaction rows carry optional option identity for future read-only imports.
CREATE TABLE investment_transactions_v2 (
  id TEXT NOT NULL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  broker_no TEXT,
  broker_account TEXT,
  broker_name TEXT,
  symbol TEXT,
  name TEXT,
  asset_type TEXT CHECK (asset_type IN ('stock', 'etf', 'fund', 'bond', 'option', 'cash', 'future', 'crypto', 'other', 'unknown')),
  trade_date TEXT,
  posted_date TEXT,
  transaction_code TEXT,
  transaction_name TEXT,
  quantity REAL,
  price REAL,
  amount INTEGER,
  currency TEXT NOT NULL DEFAULT 'TWD',
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  effective_date TEXT AS (COALESCE(trade_date, posted_date, '')),
  underlying_symbol TEXT,
  expiration_date TEXT,
  strike_price REAL,
  option_right TEXT CHECK (option_right IS NULL OR option_right IN ('call', 'put')),
  contract_symbol TEXT,
  external_contract_id TEXT,
  UNIQUE (connector_id, account_id, source_id)
);
INSERT INTO investment_transactions_v2 (
  id, connector_id, account_id, source_id, broker_no, broker_account,
  broker_name, symbol, name, asset_type, trade_date, posted_date,
  transaction_code, transaction_name, quantity, price, amount, currency,
  raw_payload, created_at, updated_at
)
SELECT id, connector_id, account_id, source_id, broker_no, broker_account,
       broker_name, symbol, name, asset_type, trade_date, posted_date,
       transaction_code, transaction_name, quantity, price, amount, currency,
       raw_payload, created_at, updated_at
FROM investment_transactions;
DROP TABLE investment_transactions;
ALTER TABLE investment_transactions_v2 RENAME TO investment_transactions;
CREATE INDEX idx_investment_transactions_effective_updated
  ON investment_transactions (effective_date DESC, updated_at DESC, id DESC);
CREATE INDEX idx_investment_transactions_symbol ON investment_transactions (symbol);
CREATE INDEX idx_investment_transactions_trade_date ON investment_transactions (trade_date);
