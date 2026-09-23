export interface ValuedAmount {
  value: number | null | undefined;
  currency: string;
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
  const assetValues = assets.map(converted);
  const liabilityValues = liabilities.map(converted);
  const grossAssets = assetValues.every((value) => value !== null)
    ? assetValues.reduce<number>((sum, value) => sum + value!, 0)
    : null;
  const totalLiabilities = liabilityValues.every((value) => value !== null)
    ? liabilityValues.reduce<number>((sum, value) => sum + value!, 0)
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
