import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const liabilityAccounts = sqliteTable(
  "liability_accounts",
  {
    id: text("id").notNull(),
    sourceType: text("source_type").notNull().default("manual"),
    connectorId: text("connector_id"),
    sourceId: text("source_id"),
    liabilityType: text("liability_type").notNull(),
    provider: text("provider"),
    name: text("name").notNull(),
    maskedIdentity: text("masked_identity"),
    currency: text("currency")
      .notNull()
      .default(sql`'TWD'`),
    originalPrincipal: integer("original_principal"),
    interestRate: real("interest_rate"),
    interestRateType: text("interest_rate_type"),
    startDate: text("start_date"),
    maturityDate: text("maturity_date"),
    monthlyPayment: integer("monthly_payment"),
    nextPaymentDate: text("next_payment_date"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique().on(table.connectorId, table.sourceId),
    index("idx_liability_accounts_type").on(
      table.liabilityType,
      sql`updated_at DESC`,
    ),
    check(
      "liability_accounts_check_1",
      sql`source_type IN ('manual', 'connector')`,
    ),
    check(
      "liability_accounts_check_2",
      sql`liability_type IN ('mortgage', 'personal_loan', 'securities_backed_loan', 'margin', 'credit_card', 'auto_loan', 'other')`,
    ),
    check(
      "liability_accounts_check_3",
      sql`interest_rate_type IS NULL OR interest_rate_type IN ('fixed', 'variable', 'unknown')`,
    ),
    check(
      "liability_accounts_check_4",
      sql`(source_type = 'manual' AND connector_id IS NULL AND source_id IS NULL) OR (source_type = 'connector' AND connector_id IS NOT NULL AND source_id IS NOT NULL)`,
    ),
  ],
);

export const liabilityBalanceSnapshots = sqliteTable(
  "liability_balance_snapshots",
  {
    id: text("id").notNull(),
    liabilityAccountId: text("liability_account_id").notNull(),
    outstandingPrincipal: integer("outstanding_principal"),
    accruedInterest: integer("accrued_interest"),
    asOfAt: text("as_of_at").notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique().on(table.liabilityAccountId, table.asOfAt),
    index("idx_liability_balance_snapshots_latest").on(
      table.liabilityAccountId,
      sql`as_of_at DESC`,
    ),
    foreignKey({
      columns: [table.liabilityAccountId],
      foreignColumns: [liabilityAccounts.id],
    }).onDelete("cascade"),
    check(
      "liability_balance_snapshots_check_1",
      sql`source IN ('manual', 'connector', 'reconstructed')`,
    ),
  ],
);

export const collateralRelationships = sqliteTable(
  "collateral_relationships",
  {
    id: text("id").notNull(),
    liabilityAccountId: text("liability_account_id").notNull(),
    assetType: text("asset_type").notNull(),
    assetId: text("asset_id").notNull(),
    collateralValue: integer("collateral_value"),
    currency: text("currency")
      .notNull()
      .default(sql`'TWD'`),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique().on(table.liabilityAccountId, table.assetType, table.assetId),
    index("idx_collateral_relationships_asset").on(
      table.assetType,
      table.assetId,
    ),
    foreignKey({
      columns: [table.liabilityAccountId],
      foreignColumns: [liabilityAccounts.id],
    }).onDelete("cascade"),
    check(
      "collateral_relationships_check_1",
      sql`asset_type IN ('investment_position', 'manual_asset', 'bank_account', 'other')`,
    ),
  ],
);
