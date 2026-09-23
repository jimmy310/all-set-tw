import {
  createManualInvestmentAccount as createManualInvestmentAccountRecord,
  createManualInvestmentPosition as createManualInvestmentPositionRecord,
  updateManualInvestmentAccount as updateManualInvestmentAccountRecord,
  deleteManualInvestmentAccount as deleteManualInvestmentAccountRecord,
  updateManualInvestmentPosition as updateManualInvestmentPositionRecord,
  deleteManualInvestmentPosition as deleteManualInvestmentPositionRecord,
  setPositionReconciliation as setPositionReconciliationRecord,
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
    underlyingSymbol?: string | null;
    expirationDate?: string | null;
    strikePrice?: number | null;
    optionRight?: string | null;
    contractMultiplier?: number;
    contractSymbol?: string | null;
    optionMarkPrice?: number | null;
    economicSecurityId?: string | null;
    observationCoverage?: string;
  },
) {
  const id = `manual-investment-position:${crypto.randomUUID()}`;
  const positionMarketValue =
    input.marketValue ??
    (input.assetType === "option" &&
    input.quantity != null &&
    input.optionMarkPrice != null
      ? Math.round(
          input.quantity *
            (input.contractMultiplier ?? 100) *
            input.optionMarkPrice,
        )
      : null);
  await createManualInvestmentPositionRecord(db, {
    ...input,
    id,
    symbol: input.symbol ?? null,
    quantity: input.quantity ?? null,
    marketValue: positionMarketValue,
    averageCost: input.averageCost ?? null,
    costBasis: input.costBasis ?? null,
    now: new Date().toISOString(),
    underlyingSymbol: input.underlyingSymbol ?? null,
    expirationDate: input.expirationDate ?? null,
    strikePrice: input.strikePrice ?? null,
    optionRight: input.optionRight ?? null,
    contractMultiplier: input.contractMultiplier ?? 1,
    contractSymbol: input.contractSymbol ?? null,
    optionMarkPrice: input.optionMarkPrice ?? null,
    economicSecurityId: input.economicSecurityId ?? null,
    observationCoverage: input.observationCoverage ?? "complete",
  });
  return id;
}

export function editManualInvestmentAccount(
  db: D1Database,
  id: string,
  input: {
    provider: string;
    accountType: string;
    displayName: string;
    maskedIdentity?: string | null;
    currency: string;
    market?: string | null;
  },
) {
  return updateManualInvestmentAccountRecord(
    db,
    id,
    {
      ...input,
      maskedIdentity: input.maskedIdentity ?? null,
      market: input.market ?? null,
    },
    new Date().toISOString(),
  );
}

export function removeManualInvestmentAccount(db: D1Database, id: string) {
  return deleteManualInvestmentAccountRecord(db, id);
}

export function editManualInvestmentPosition(
  db: D1Database,
  id: string,
  input: Parameters<typeof addManualInvestmentPosition>[1],
) {
  const {
    accountId,
    assetType,
    symbol,
    name,
    quantity,
    marketValue,
    currency,
    averageCost,
    costBasis,
    custodyStatus,
    asOfDate,
    underlyingSymbol,
    expirationDate,
    strikePrice,
    optionRight,
    contractMultiplier,
    contractSymbol,
    optionMarkPrice,
    economicSecurityId,
    observationCoverage,
  } = input;
  const positionMarketValue =
    marketValue ??
    (assetType === "option" && quantity != null && optionMarkPrice != null
      ? Math.round(quantity * (contractMultiplier ?? 100) * optionMarkPrice)
      : null);
  return updateManualInvestmentPositionRecord(
    db,
    id,
    {
      accountId,
      assetType,
      symbol: symbol ?? null,
      name,
      quantity: quantity ?? null,
      marketValue: positionMarketValue,
      currency,
      averageCost: averageCost ?? null,
      costBasis: costBasis ?? null,
      custodyStatus,
      asOfDate,
      underlyingSymbol: underlyingSymbol ?? null,
      expirationDate: expirationDate ?? null,
      strikePrice: strikePrice ?? null,
      optionRight: optionRight ?? null,
      contractMultiplier: contractMultiplier ?? 1,
      contractSymbol: contractSymbol ?? null,
      optionMarkPrice: optionMarkPrice ?? null,
      economicSecurityId: economicSecurityId ?? null,
      observationCoverage: observationCoverage ?? "complete",
    },
    new Date().toISOString(),
  );
}

export function removeManualInvestmentPosition(db: D1Database, id: string) {
  return deleteManualInvestmentPositionRecord(db, id);
}

export function linkPositionReconciliation(
  db: D1Database,
  id: string,
  input: { economicSecurityId: string | null; observationCoverage: string },
) {
  return setPositionReconciliationRecord(
    db,
    id,
    input.economicSecurityId,
    input.observationCoverage,
  );
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
