export interface ValuedAmount {
  value: number | null | undefined;
  currency: string;
  /** Negative derivative marks are obligations, not negative gross assets. */
  kind?: "asset" | "derivative";
}

export function investmentPositionValue(item: {
  assetType: string;
  marketValue?: number | null;
  cashBalance?: number | null;
}): number | null {
  if (item.marketValue == null) {
    return item.assetType === "cash" ? (item.cashBalance ?? null) : null;
  }
  return item.marketValue + (item.cashBalance ?? 0);
}

export interface InvestmentValuationPosition {
  assetType: string;
  marketValue?: number | null;
  cashBalance?: number | null;
  currency: string;
  economicSecurityId?: string | null;
  observationCoverage?: "complete" | "subset";
  asOfDate?: string;
}

/**
 * Keep source rows intact for holdings detail, while producing the single
 * economic position used by every portfolio and balance-sheet total.
 */
export function reconcileInvestmentPositions<
  T extends InvestmentValuationPosition,
>(investments: T[]): T[] {
  const groups = new Map<string, T[]>();
  const standalone: T[] = [];
  for (const position of investments) {
    if (!position.economicSecurityId) {
      standalone.push(position);
      continue;
    }
    const rows = groups.get(position.economicSecurityId) ?? [];
    rows.push(position);
    groups.set(position.economicSecurityId, rows);
  }

  const reconciled = [...groups.values()].map((rows) => {
    const complete = rows
      .filter((row) => row.observationCoverage !== "subset")
      .sort(
        (a, b) =>
          (b.asOfDate ?? "").localeCompare(a.asOfDate ?? "") ||
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
      );
    if (complete[0]) return complete[0];

    const currencies = new Set(rows.map((row) => row.currency));
    if (currencies.size !== 1)
      return { ...rows[0]!, marketValue: null, cashBalance: null };
    return {
      ...rows[0]!,
      marketValue: rows.every((row) => row.marketValue != null)
        ? rows.reduce((sum, row) => sum + row.marketValue!, 0)
        : null,
      cashBalance: rows.every((row) => row.cashBalance == null)
        ? null
        : rows.every((row) => row.cashBalance != null)
          ? rows.reduce((sum, row) => sum + row.cashBalance!, 0)
          : null,
    };
  });
  return [...standalone, ...reconciled];
}

export interface InvestmentPortfolioSummary {
  positions: InvestmentValuationPosition[];
  netValueTwd: number | null;
  grossAssetsTwd: number | null;
  derivativeLiabilitiesTwd: number | null;
  incomplete: boolean;
  missingCurrencies: string[];
}

/** Investment net value includes signed derivative marks; gross assets do not. */
export function calculateInvestmentPortfolioSummary(
  investments: InvestmentValuationPosition[],
  rates: Record<string, number>,
): InvestmentPortfolioSummary {
  const positions = reconcileInvestmentPositions(investments);
  const missingCurrencies = new Set<string>();
  const values = positions.map((position) => {
    const value = investmentPositionValue(position);
    if (value == null) return { position, value: null };
    if (position.currency === "TWD") return { position, value };
    const rate = rates[position.currency];
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
      if (value !== 0) missingCurrencies.add(position.currency);
      return { position, value: value === 0 ? 0 : null };
    }
    return { position, value: value * rate };
  });
  const complete = values.every(({ value }) => value != null);
  const netValueTwd = complete
    ? values.reduce((sum, item) => sum + item.value!, 0)
    : null;
  const grossAssetsTwd = complete
    ? values.reduce(
        (sum, { position, value }) =>
          sum +
          (position.assetType === "option" || position.assetType === "future"
            ? Math.max(value!, 0)
            : value!),
        0,
      )
    : null;
  const derivativeValues = values.filter(
    ({ position }) =>
      position.assetType === "option" || position.assetType === "future",
  );
  const derivativeLiabilitiesTwd = derivativeValues.every(
    ({ value }) => value != null,
  )
    ? derivativeValues.reduce((sum, { value }) => sum + Math.max(-value!, 0), 0)
    : null;
  return {
    positions,
    netValueTwd,
    grossAssetsTwd,
    derivativeLiabilitiesTwd,
    incomplete: !complete,
    missingCurrencies: [...missingCurrencies].sort(),
  };
}

export interface PositionObservation {
  economicPositionId: string;
  quantity: number;
  coverage: "complete" | "subset";
  asOfDate: string;
}

export function reconcilePositionObservations(
  observations: PositionObservation[],
) {
  const groups = new Map<string, PositionObservation[]>();
  for (const observation of observations) {
    const group = groups.get(observation.economicPositionId) ?? [];
    group.push(observation);
    groups.set(observation.economicPositionId, group);
  }
  return [...groups].map(([economicPositionId, rows]) => {
    const complete = rows
      .filter((row) => row.coverage === "complete")
      .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate));
    return {
      economicPositionId,
      quantity:
        complete[0]?.quantity ??
        rows.reduce((sum, row) => sum + row.quantity, 0),
      sourceCount: rows.length,
      reconciledBy:
        complete.length > 0
          ? "complete_observation"
          : "sum_of_disjoint_subsets",
    };
  });
}

export function calculateBalanceSheet({
  assets,
  liabilities,
  rates,
}: {
  assets: ValuedAmount[];
  liabilities: ValuedAmount[];
  rates: Record<string, number>;
}) {
  const missingCurrencies = new Set<string>();
  const unknownAssetValues = assets.some((item) => item.value == null);
  const unknownLiabilityValues = liabilities.some((item) => item.value == null);
  const converted = (item: ValuedAmount) => {
    if (item.value == null) return null;
    if (item.currency === "TWD") return item.value;
    const rate = rates[item.currency];
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      if (item.value !== 0) missingCurrencies.add(item.currency);
      return item.value === 0 ? 0 : null;
    }
    return item.value * rate;
  };
  const assetValues = assets.map((item) => ({ item, value: converted(item) }));
  const liabilityValues = liabilities.map(converted);
  const grossAssets = assetValues.every(({ value }) => value !== null)
    ? assetValues.reduce<number>(
        (sum, { item, value }) =>
          sum + (item.kind === "derivative" ? Math.max(value!, 0) : value!),
        0,
      )
    : null;
  const derivatives = assetValues.filter(
    ({ item }) => item.kind === "derivative",
  );
  const derivativeLiabilities = derivatives.every(({ value }) => value !== null)
    ? derivatives.reduce<number>(
        (sum, { value }) => sum + Math.max(-value!, 0),
        0,
      )
    : null;
  const totalLiabilities =
    liabilityValues.every((value) => value !== null) &&
    derivativeLiabilities !== null
      ? liabilityValues.reduce<number>((sum, value) => sum + value!, 0) +
        derivativeLiabilities
      : null;
  return {
    grossAssets,
    totalLiabilities,
    netWorth:
      grossAssets === null || totalLiabilities === null
        ? null
        : grossAssets - totalLiabilities,
    unknownAssetValues,
    unknownLiabilityValues,
    missingCurrencies: [...missingCurrencies].sort(),
  };
}

/** Canonical personal balance-sheet contract shared by Overview and Assets. */
export function calculatePersonalBalanceSheet(input: {
  bankAccounts: Array<{
    accountType?: string;
    balance?: number | null;
    currency: string;
  }>;
  investments: Array<{
    assetType: string;
    marketValue?: number | null;
    cashBalance?: number | null;
    currency: string;
    economicSecurityId?: string | null;
    observationCoverage?: "complete" | "subset";
    asOfDate?: string;
  }>;
  manualAssets: Array<{ value?: number | null; currency: string }>;
  liabilities: Array<{
    liabilityType?: string;
    outstandingPrincipal?: number | null;
    accruedInterest?: number | null;
    currency: string;
  }>;
  rates: Record<string, number>;
}) {
  const reconciledPositions = reconcileInvestmentPositions(input.investments);
  const assets: ValuedAmount[] = [
    ...input.bankAccounts
      .filter((item) => item.accountType !== "credit")
      .map((item) => ({ value: item.balance, currency: item.currency })),
    ...reconciledPositions.map((item) => ({
      value: investmentPositionValue(item),
      currency: item.currency,
      kind: ["option", "future"].includes(item.assetType)
        ? ("derivative" as const)
        : ("asset" as const),
    })),
    ...input.manualAssets.map((item) => ({
      value: item.value,
      currency: item.currency,
    })),
  ];
  const liabilities: ValuedAmount[] = [
    ...input.bankAccounts
      .filter((item) => item.accountType === "credit")
      .map((item) => ({
        value: item.balance == null ? null : Math.abs(item.balance),
        currency: item.currency,
      })),
    ...input.liabilities
      .filter((item) => item.liabilityType !== "credit_card")
      .map((item) => ({
        value:
          item.outstandingPrincipal == null
            ? null
            : item.outstandingPrincipal + (item.accruedInterest ?? 0),
        currency: item.currency,
      })),
  ];
  return calculateBalanceSheet({ assets, liabilities, rates: input.rates });
}
