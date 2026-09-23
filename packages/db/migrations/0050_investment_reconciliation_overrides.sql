-- Keep user reconciliation links separate from source-owned position rows.
ALTER TABLE investment_positions ADD COLUMN source_position_key TEXT;

-- Manual rows have stable system IDs that remain the same across edits.
UPDATE investment_positions
SET source_position_key = source_id
WHERE connector_id = 'manual';

-- Earlier TDCC source IDs appended the exact snapshot date to the stable
-- account/instrument identity. Remove only that proven trailing suffix.
UPDATE investment_positions
SET source_position_key = substr(
  source_id,
  1,
  length(source_id) - length(':' || as_of_date)
)
WHERE connector_id = 'tdcc'
  AND source_position_key IS NULL
  AND length(source_id) > length(':' || as_of_date)
  AND substr(
    source_id,
    length(source_id) - length(':' || as_of_date) + 1
  ) = ':' || as_of_date;

CREATE TABLE investment_reconciliation_overrides (
  connector_id TEXT NOT NULL,
  source_position_key TEXT NOT NULL,
  economic_security_id TEXT NOT NULL,
  observation_coverage TEXT NOT NULL CHECK (observation_coverage IN ('complete', 'subset')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (connector_id, source_position_key)
);

CREATE INDEX idx_investment_reconciliation_overrides_economic_security
  ON investment_reconciliation_overrides (economic_security_id);

-- Earlier manual UI selections lived on manual source rows. Preserve their
-- effective behavior as user overrides; retain the original source columns.
INSERT INTO investment_reconciliation_overrides (
  connector_id, source_position_key, economic_security_id,
  observation_coverage, created_at, updated_at
)
SELECT position.connector_id, position.source_position_key,
       position.economic_security_id, position.observation_coverage,
       position.created_at, position.updated_at
FROM investment_positions position
WHERE position.connector_id = 'manual'
  AND position.source_position_key IS NOT NULL
  AND position.economic_security_id IS NOT NULL
  AND position.id = (
    SELECT latest.id
    FROM investment_positions latest
    WHERE latest.connector_id = position.connector_id
      AND latest.source_position_key = position.source_position_key
      AND latest.economic_security_id IS NOT NULL
    ORDER BY latest.as_of_date DESC, latest.updated_at DESC, latest.id DESC
    LIMIT 1
  );

CREATE INDEX idx_investment_positions_source_position_key
  ON investment_positions (connector_id, source_position_key, as_of_date DESC);
