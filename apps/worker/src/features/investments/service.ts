import {
  createManualInvestmentAccount as createManualInvestmentAccountRecord,
  createManualInvestmentPosition as createManualInvestmentPositionRecord,
  listInvestmentAccounts as listInvestmentAccountRecords,
  listInvestmentTransactions,
  listInvestmentTransactionsInRange,
  listLatestInvestmentPositions,
  type InvestmentPageCursor,
  type TransactionPageCursor,
} from "./repository";
import type { MonthDateRange } from "../../platform/month-range";

export function getInvestmentAccounts(db: D1Database) {
  return listInvestmentAccountRecords(db);
}

export async function addManualInvestmentAccount(
  db: D1Database,
  input: {
    provider: string;
    accountType: string;
    displayName: string;
    maskedIdentity?: string | null;
    currency: string;
    market?: string | null;
  },
) {
  const id = `manual-investment-account:${crypto.randomUUID()}`;
  await createManualInvestmentAccountRecord(db, {
    ...input,
    id,
    maskedIdentity: input.maskedIdentity ?? null,
    market: input.market ?? null,
    now: new Date().toISOString(),
  });
  return id;
}

export async function addManualInvestmentPosition(
  db: D1Database,
  input: {
    accountId: string;
    assetType: string;
    symbol?: string | null;
    name: string;
    quantity?: number | null;
    marketValue?: number | null;
    currency: string;
    averageCost?: number | null;
    costBasis?: number | null;
    custodyStatus: string;
    asOfDate: string;
  },
) {
  const id = `manual-investment-position:${crypto.randomUUID()}`;
  await createManualInvestmentPositionRecord(db, {
    ...input,
    id,
    symbol: input.symbol ?? null,
    quantity: input.quantity ?? null,
    marketValue: input.marketValue ?? null,
    averageCost: input.averageCost ?? null,
    costBasis: input.costBasis ?? null,
    now: new Date().toISOString(),
  });
  return id;
}

export async function getInvestmentPage(
  db: D1Database,
  limit: number,
  cursor?: InvestmentPageCursor,
) {
  const rows = await listLatestInvestmentPositions(db, limit + 1, cursor);
  const hasMore = rows.length > limit;
  const positions = rows.slice(0, limit);
  return { hasMore, positions, last: positions.at(-1) };
}

export async function getInvestmentTransactionPage(
  db: D1Database,
  limit: number,
  cursor?: TransactionPageCursor,
) {
  const rows = await listInvestmentTransactions(db, limit + 1, cursor);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    hasMore,
    last,
    transactions: page.map(
      ({
        effectiveDate: _effectiveDate,
        updatedAt: _updatedAt,
        ...transaction
      }) => transaction,
    ),
  };
}

export async function getInvestmentTransactionsRange(
  db: D1Database,
  range: MonthDateRange,
  days?: string[],
) {
  const rows = await listInvestmentTransactionsInRange(db, range, days);
  return rows.map(
    ({
      effectiveDate: _effectiveDate,
      updatedAt: _updatedAt,
      ...transaction
    }) => transaction,
  );
}
