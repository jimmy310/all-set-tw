import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  unique,
  index,
  check,
  foreignKey,
} from "drizzle-orm/sqlite-core";

// SQL migrations remain authoritative for schema shape and constraints.

export const investmentAccounts = sqliteTable(
  "investment_accounts",
  {
    id: text("id").notNull(),
    connectorId: text("connector_id").notNull(),
    sourceId: text("source_id").notNull(),
    provider: text("provider").notNull(),
    accountType: text("account_type").notNull(),
    displayName: text("display_name").notNull(),
    maskedIdentity: text("masked_identity"),
    currency: text("currency")
      .notNull()
      .default(sql`'TWD'`),
    market: text("market"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    unique().on(table.connectorId, table.sourceId),
    index("idx_investment_accounts_provider").on(
      table.provider,
      table.accountType,
    ),
    check(
      "investment_accounts_check_1",
      sql`account_type IN ('brokerage', 'sub_brokerage', 'securities_finance', 'other')`,
    ),
  ],
);

export const investmentPositions = sqliteTable(
  "investment_positions",
  {
    id: text("id").notNull(),
    connectorId: text("connector_id").notNull(),
    sourceId: text("source_id").notNull(),
    assetType: text("asset_type").notNull(),
    symbol: text("symbol"),
    name: text("name").notNull(),
    quantity: real("quantity"),
    marketValue: integer("market_value"),
    cashBalance: integer("cash_balance"),
    currency: text("currency")
      .notNull()
      .default(sql`'TWD'`),
    asOfDate: text("as_of_date").notNull(),
    rawPayload: text("raw_payload"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    investmentAccountId: text("investment_account_id"),
    custodyStatus: text("custody_status").notNull().default("free"),
    averageCost: real("average_cost"),
    costBasis: integer("cost_basis"),
    valuationSource: text("valuation_source").notNull().default("source"),
    underlyingSymbol: text("underlying_symbol"),
    expirationDate: text("expiration_date"),
    strikePrice: real("strike_price"),
    optionRight: text("option_right"),
    contractMultiplier: real("contract_multiplier").notNull().default(1),
    contractSymbol: text("contract_symbol"),
    optionMarkPrice: real("option_mark_price"),
    economicSecurityId: text("economic_security_id"),
    observationCoverage: text("observation_coverage")
      .notNull()
      .default("complete"),
    sourcePositionKey: text("source_position_key"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    foreignKey({
      columns: [table.investmentAccountId],
      foreignColumns: [investmentAccounts.id],
    }).onDelete("set null"),
    index("idx_investment_positions_page").on(
      sql`as_of_date DESC`,
      sql`asset_type ASC`,
      sql`name ASC`,
      sql`id ASC`,
    ),
    index("idx_investment_positions_latest_scope").on(
      table.connectorId,
      table.assetType,
      sql`as_of_date DESC`,
    ),
    index("idx_investment_positions_asset_type").on(table.assetType),
    index("idx_investment_positions_as_of_date").on(table.asOfDate),
    index("idx_investment_positions_account_date").on(
      table.investmentAccountId,
      sql`as_of_date DESC`,
    ),
    index("idx_investment_positions_economic_security").on(
      table.economicSecurityId,
      sql`as_of_date DESC`,
    ),
    index("idx_investment_positions_source_position_key").on(
      table.connectorId,
      table.sourcePositionKey,
      sql`as_of_date DESC`,
    ),
    unique().on(table.connectorId, table.sourceId, table.asOfDate),
    check(
      "investment_positions_check_1",
      sql`asset_type IN ('stock', 'etf', 'fund', 'bond', 'option', 'cash', 'future', 'crypto', 'other')`,
    ),
    check(
      "investment_positions_check_2",
      sql`custody_status IN ('free', 'collateral', 'margin', 'restricted')`,
    ),
    check(
      "investment_positions_check_3",
      sql`option_right IS NULL OR option_right IN ('call', 'put')`,
    ),
    check(
      "investment_positions_check_4",
      sql`observation_coverage IN ('complete', 'subset')`,
    ),
    check("investment_positions_check_5", sql`contract_multiplier > 0`),
  ],
);

export const investmentReconciliationOverrides = sqliteTable(
  "investment_reconciliation_overrides",
  {
    connectorId: text("connector_id").notNull(),
    sourcePositionKey: text("source_position_key").notNull(),
    economicSecurityId: text("economic_security_id").notNull(),
    observationCoverage: text("observation_coverage").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectorId, table.sourcePositionKey] }),
    index("idx_investment_reconciliation_overrides_economic_security").on(
      table.economicSecurityId,
    ),
    check(
      "investment_reconciliation_overrides_check_1",
      sql`observation_coverage IN ('complete', 'subset')`,
    ),
  ],
);

export const investmentTransactions = sqliteTable(
  "investment_transactions",
  {
    id: text("id").notNull(),
    connectorId: text("connector_id").notNull(),
    accountId: text("account_id").notNull(),
    sourceId: text("source_id").notNull(),
    brokerNo: text("broker_no"),
    brokerAccount: text("broker_account"),
    brokerName: text("broker_name"),
    symbol: text("symbol"),
    name: text("name"),
    assetType: text("asset_type"),
    tradeDate: text("trade_date"),
    postedDate: text("posted_date"),
    transactionCode: text("transaction_code"),
    transactionName: text("transaction_name"),
    quantity: real("quantity"),
    price: real("price"),
    amount: integer("amount"),
    currency: text("currency")
      .notNull()
      .default(sql`'TWD'`),
    rawPayload: text("raw_payload"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    effectiveDate: text("effective_date").generatedAlwaysAs(
      sql`COALESCE(trade_date, posted_date, '')`,
      { mode: "virtual" },
    ),
    underlyingSymbol: text("underlying_symbol"),
    expirationDate: text("expiration_date"),
    strikePrice: real("strike_price"),
    optionRight: text("option_right"),
    contractSymbol: text("contract_symbol"),
    externalContractId: text("external_contract_id"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_investment_transactions_effective_updated").on(
      sql`effective_date DESC`,
      sql`updated_at DESC`,
      sql`id DESC`,
    ),
    index("idx_investment_transactions_symbol").on(table.symbol),
    index("idx_investment_transactions_trade_date").on(table.tradeDate),
    unique().on(table.connectorId, table.accountId, table.sourceId),
    check(
      "investment_transactions_check_1",
      sql`asset_type IN ('stock', 'etf', 'fund', 'bond', 'option', 'cash', 'future', 'crypto', 'other', 'unknown')`,
    ),
    check(
      "investment_transactions_check_2",
      sql`option_right IS NULL OR option_right IN ('call', 'put')`,
    ),
  ],
);
