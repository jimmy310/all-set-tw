import {
  createDrizzle,
  investmentPositions,
  investmentTransactions,
  investmentAccounts,
} from "@taiwan-fin-hub/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { MonthDateRange } from "../../platform/month-range";

const investmentTransactionColumns = {
  id: investmentTransactions.id,
  connectorId: investmentTransactions.connectorId,
  accountId: investmentTransactions.accountId,
  sourceId: investmentTransactions.sourceId,
  brokerNo: investmentTransactions.brokerNo,
  brokerAccount: investmentTransactions.brokerAccount,
  brokerName: investmentTransactions.brokerName,
  symbol: investmentTransactions.symbol,
  name: investmentTransactions.name,
  assetType: investmentTransactions.assetType,
  tradeDate: investmentTransactions.tradeDate,
  postedDate: investmentTransactions.postedDate,
  transactionCode: investmentTransactions.transactionCode,
  transactionName: investmentTransactions.transactionName,
  quantity: investmentTransactions.quantity,
  price: investmentTransactions.price,
  amount: investmentTransactions.amount,
  currency: investmentTransactions.currency,
  effectiveDate: sql<string>`${investmentTransactions.effectiveDate}`,
  updatedAt: investmentTransactions.updatedAt,
};

export type InvestmentPageCursor = {
  asOfDate: string;
  assetType: string;
  name: string;
  id: string;
};

export type TransactionPageCursor = {
  effectiveDate: string;
  updatedAt: string;
  id: string;
};

export type InvestmentPositionRow = {
  id: string;
  assetType: string;
  symbol: string | null;
  name: string;
  quantity: number | null;
  marketValue: number | null;
  cashBalance: number | null;
  currency: string;
  asOfDate: string;
};

export async function listLatestInvestmentPositions(
  db: D1Database,
  limit: number,
  cursor?: InvestmentPageCursor,
) {
  return createDrizzle(db)
    .select({
      id: investmentPositions.id,
      assetType: investmentPositions.assetType,
      symbol: investmentPositions.symbol,
      name: investmentPositions.name,
      quantity: investmentPositions.quantity,
      marketValue: investmentPositions.marketValue,
      cashBalance: investmentPositions.cashBalance,
      currency: investmentPositions.currency,
      asOfDate: investmentPositions.asOfDate,
      investmentAccountId: investmentPositions.investmentAccountId,
      custodyStatus: investmentPositions.custodyStatus,
    })
    .from(investmentPositions)
    .where(
      and(
        // Latest as_of_date is per connector + asset type, not a global max.
        eq(
          investmentPositions.asOfDate,
          sql`(
            SELECT MAX(p2.as_of_date)
            FROM investment_positions p2
            WHERE p2.connector_id = ${investmentPositions.connectorId}
              AND p2.asset_type = ${investmentPositions.assetType}
          )`,
        ),
        cursor
          ? sql`(
              ${investmentPositions.asOfDate} < ${cursor.asOfDate}
              OR (
                ${investmentPositions.asOfDate} = ${cursor.asOfDate}
                AND (${investmentPositions.assetType}, ${investmentPositions.name}, ${investmentPositions.id})
                  > (${cursor.assetType}, ${cursor.name}, ${cursor.id})
              )
            )`
          : undefined,
      ),
    )
    .orderBy(
      desc(investmentPositions.asOfDate),
      asc(investmentPositions.assetType),
      asc(investmentPositions.name),
      asc(investmentPositions.id),
    )
    .limit(limit)
    .all();
}

export function listInvestmentAccounts(db: D1Database) {
  return createDrizzle(db)
    .select({
      id: investmentAccounts.id,
      provider: investmentAccounts.provider,
      accountType: investmentAccounts.accountType,
      displayName: investmentAccounts.displayName,
      maskedIdentity: investmentAccounts.maskedIdentity,
      currency: investmentAccounts.currency,
      market: investmentAccounts.market,
    })
    .from(investmentAccounts)
    .orderBy(asc(investmentAccounts.displayName), asc(investmentAccounts.id))
    .all();
}

export async function createManualInvestmentAccount(
  db: D1Database,
  input: {
    id: string;
    provider: string;
    accountType: string;
    displayName: string;
    maskedIdentity: string | null;
    currency: string;
    market: string | null;
    now: string;
  },
) {
  await createDrizzle(db).insert(investmentAccounts).values({
    id: input.id,
    connectorId: "manual",
    sourceId: input.id,
    provider: input.provider,
    accountType: input.accountType,
    displayName: input.displayName,
    maskedIdentity: input.maskedIdentity,
    currency: input.currency,
    market: input.market,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export async function createManualInvestmentPosition(
  db: D1Database,
  input: {
    id: string;
    accountId: string;
    assetType: string;
    symbol: string | null;
    name: string;
    quantity: number | null;
    marketValue: number | null;
    currency: string;
    averageCost: number | null;
    costBasis: number | null;
    custodyStatus: string;
    asOfDate: string;
    now: string;
  },
) {
  await createDrizzle(db).insert(investmentPositions).values({
    id: input.id,
    connectorId: "manual",
    sourceId: input.id,
    investmentAccountId: input.accountId,
    assetType: input.assetType,
    symbol: input.symbol,
    name: input.name,
    quantity: input.quantity,
    marketValue: input.marketValue,
    currency: input.currency,
    asOfDate: input.asOfDate,
    averageCost: input.averageCost,
    costBasis: input.costBasis,
    custodyStatus: input.custodyStatus,
    valuationSource: "manual",
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export async function listInvestmentTransactions(
  db: D1Database,
  limit: number,
  cursor?: TransactionPageCursor,
) {
  return createDrizzle(db)
    .select(investmentTransactionColumns)
    .from(investmentTransactions)
    .where(
      cursor
        ? sql`(${investmentTransactions.effectiveDate}, ${investmentTransactions.updatedAt}, ${investmentTransactions.id}) < (${cursor.effectiveDate}, ${cursor.updatedAt}, ${cursor.id})`
        : undefined,
    )
    .orderBy(
      desc(investmentTransactions.effectiveDate),
      desc(investmentTransactions.updatedAt),
      desc(investmentTransactions.id),
    )
    .limit(limit)
    .all();
}

export async function listInvestmentTransactionsInRange(
  db: D1Database,
  range: MonthDateRange,
  days?: string[],
) {
  return createDrizzle(db)
    .select(investmentTransactionColumns)
    .from(investmentTransactions)
    .where(
      days
        ? sql`substr(${investmentTransactions.effectiveDate}, 1, 10) IN (SELECT value FROM json_each(${JSON.stringify(days)}))`
        : and(
            sql`${investmentTransactions.effectiveDate} >= ${range.from}`,
            sql`${investmentTransactions.effectiveDate} < ${range.to}`,
          ),
    )
    .orderBy(
      desc(investmentTransactions.effectiveDate),
      desc(investmentTransactions.updatedAt),
      desc(investmentTransactions.id),
    )
    .all();
}
