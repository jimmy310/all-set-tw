import {
  createManualInvestmentAccount as createManualInvestmentAccountRecord,
  createManualInvestmentPosition as createManualInvestmentPositionRecord,
  updateManualInvestmentAccount as updateManualInvestmentAccountRecord,
  deleteManualInvestmentAccount as deleteManualInvestmentAccountRecord,
  updateManualInvestmentPosition as updateManualInvestmentPositionRecord,
  deleteManualInvestmentPosition as deleteManualInvestmentPositionRecord,
  setPositionReconciliation as setPositionReconciliationRecord,
  removePositionReconciliation as removePositionReconciliationRecord,
  listInvestmentReconciliationOverrides,
  listInvestmentAccounts as listInvestmentAccountRecords,
  listInvestmentTransactions,
  listInvestmentTransactionsInRange,
  listLatestInvestmentPositions,
  hasManualInvestmentAccount,
  hasManualInvestmentPosition,
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
    cashBalance?: number | null;
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
  },
) {
  if (!(await hasManualInvestmentAccount(db, input.accountId))) return null;
  const id = `manual-investment-position:${crypto.randomUUID()}`;
  const isCash = input.assetType === "cash";
  const isOption = input.assetType === "option";
  const contractMultiplier = isOption ? (input.contractMultiplier ?? 100) : 1;
  const positionMarketValue = isCash
    ? null
    : (input.marketValue ??
      (isOption && input.quantity != null && input.optionMarkPrice != null
        ? Math.round(
            input.quantity * contractMultiplier * input.optionMarkPrice,
          )
        : null));
  await createManualInvestmentPositionRecord(db, {
    ...input,
    id,
    symbol: input.symbol ?? null,
    quantity: isCash ? null : (input.quantity ?? null),
    marketValue: positionMarketValue,
    cashBalance: isCash ? (input.cashBalance ?? null) : null,
    averageCost: input.averageCost ?? null,
    costBasis: input.costBasis ?? null,
    now: new Date().toISOString(),
    underlyingSymbol: isOption ? (input.underlyingSymbol ?? null) : null,
    expirationDate: isOption ? (input.expirationDate ?? null) : null,
    strikePrice: isOption ? (input.strikePrice ?? null) : null,
    optionRight: isOption ? (input.optionRight ?? null) : null,
    contractMultiplier,
    contractSymbol: isOption ? (input.contractSymbol ?? null) : null,
    optionMarkPrice: isOption ? (input.optionMarkPrice ?? null) : null,
    economicSecurityId: null,
    observationCoverage: "complete",
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

export async function editManualInvestmentPosition(
  db: D1Database,
  id: string,
  input: Parameters<typeof addManualInvestmentPosition>[1],
) {
  if (
    !(await hasManualInvestmentPosition(db, id)) ||
    !(await hasManualInvestmentAccount(db, input.accountId))
  )
    return false;
  const {
    accountId,
    assetType,
    symbol,
    name,
    quantity,
    marketValue,
    cashBalance,
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
  } = input;
  const isCash = assetType === "cash";
  const isOption = assetType === "option";
  const normalizedMultiplier = isOption ? (contractMultiplier ?? 100) : 1;
  const positionMarketValue = isCash
    ? null
    : (marketValue ??
      (isOption && quantity != null && optionMarkPrice != null
        ? Math.round(quantity * normalizedMultiplier * optionMarkPrice)
        : null));
  return updateManualInvestmentPositionRecord(
    db,
    id,
    {
      accountId,
      assetType,
      symbol: symbol ?? null,
      name,
      quantity: isCash ? null : (quantity ?? null),
      marketValue: positionMarketValue,
      cashBalance: isCash ? (cashBalance ?? null) : null,
      currency,
      averageCost: averageCost ?? null,
      costBasis: costBasis ?? null,
      custodyStatus,
      asOfDate,
      underlyingSymbol: isOption ? (underlyingSymbol ?? null) : null,
      expirationDate: isOption ? (expirationDate ?? null) : null,
      strikePrice: isOption ? (strikePrice ?? null) : null,
      optionRight: isOption ? (optionRight ?? null) : null,
      contractMultiplier: normalizedMultiplier,
      contractSymbol: isOption ? (contractSymbol ?? null) : null,
      optionMarkPrice: isOption ? (optionMarkPrice ?? null) : null,
      economicSecurityId: null,
      observationCoverage: "complete",
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
  input: {
    economicSecurityId: string;
    observationCoverage: "complete" | "subset";
  },
) {
  return setPositionReconciliationRecord(
    db,
    id,
    input.economicSecurityId,
    input.observationCoverage,
    new Date().toISOString(),
  );
}

export function unlinkPositionReconciliation(db: D1Database, id: string) {
  return removePositionReconciliationRecord(db, id);
}

export function resolveInvestmentReconciliationOverrides<
  T extends {
    connectorId: string;
    sourcePositionKey: string | null;
    economicSecurityId: string | null;
    observationCoverage: string;
  },
>(
  positions: T[],
  overrides: Array<{
    connectorId: string;
    sourcePositionKey: string;
    economicSecurityId: string;
    observationCoverage: string;
  }>,
) {
  const bySource = new Map(
    overrides.map((override) => [
      `${override.connectorId}\u0000${override.sourcePositionKey}`,
      override,
    ]),
  );
  return positions.map((position) => {
    const override = position.sourcePositionKey
      ? bySource.get(
          `${position.connectorId}\u0000${position.sourcePositionKey}`,
        )
      : undefined;
    return {
      ...position,
      sourceEconomicSecurityId: position.economicSecurityId,
      sourceObservationCoverage: position.observationCoverage,
      economicSecurityId:
        override?.economicSecurityId ?? position.economicSecurityId,
      observationCoverage:
        override?.observationCoverage ?? position.observationCoverage,
      hasReconciliationOverride: override !== undefined,
    };
  });
}

export async function getInvestmentPage(
  db: D1Database,
  limit: number,
  cursor?: InvestmentPageCursor,
) {
  const rows = await listLatestInvestmentPositions(db, limit + 1, cursor);
  const overrides = await listInvestmentReconciliationOverrides(db);
  const hasMore = rows.length > limit;
  const resolvedPositions = resolveInvestmentReconciliationOverrides(
    rows.slice(0, limit),
    overrides,
  );
  const positions = resolvedPositions.map(
    ({
      sourcePositionKey: _sourcePositionKey,
      sourceId: _sourceId,
      ...position
    }) => position,
  );
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
