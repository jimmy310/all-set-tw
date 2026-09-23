import { describe, expect, it } from "vitest";
import {
  calculateBalanceSheet,
  reconcilePositionObservations,
} from "./balance-sheet";

describe("personal balance sheet invariants", () => {
  it("calculates gross assets, liabilities, and net worth independently", () => {
    expect(
      calculateBalanceSheet({
        assets: [{ value: 15_000_000, currency: "TWD" }],
        liabilities: [{ value: 6_000_000, currency: "TWD" }],
        rates: {},
      }),
    ).toMatchObject({
      grossAssets: 15_000_000,
      totalLiabilities: 6_000_000,
      netWorth: 9_000_000,
    });
  });

  it("does not increase net worth when borrowed cash and debt rise equally", () => {
    const before = calculateBalanceSheet({
      assets: [{ value: 1_000, currency: "TWD" }],
      liabilities: [],
      rates: {},
    });
    const after = calculateBalanceSheet({
      assets: [
        { value: 1_000, currency: "TWD" },
        { value: 500, currency: "TWD" },
      ],
      liabilities: [{ value: 500, currency: "TWD" }],
      rates: {},
    });
    expect(after.netWorth).toBe(before.netWorth);
  });

  it("keeps collateral in asset value and does not treat it as a liability", () => {
    const free = calculateBalanceSheet({
      assets: [{ value: 8_000, currency: "TWD" }],
      liabilities: [],
      rates: {},
    });
    const collateral = calculateBalanceSheet({
      assets: [{ value: 8_000, currency: "TWD" }],
      liabilities: [],
      rates: {},
    });
    expect(collateral.grossAssets).toBe(free.grossAssets);
    expect(collateral.totalLiabilities).toBe(0);
  });

  it("adds disjoint custody quantities and prefers a complete total over an overlapping subset", () => {
    expect(
      reconcilePositionObservations([
        {
          economicPositionId: "2330",
          quantity: 3_000,
          coverage: "subset",
          asOfDate: "2026-08-01",
        },
        {
          economicPositionId: "2330",
          quantity: 5_000,
          coverage: "subset",
          asOfDate: "2026-08-01",
        },
      ])[0]?.quantity,
    ).toBe(8_000);
    expect(
      reconcilePositionObservations([
        {
          economicPositionId: "2330:all",
          quantity: 8_000,
          coverage: "complete",
          asOfDate: "2026-08-01",
        },
        {
          economicPositionId: "2330:all",
          quantity: 5_000,
          coverage: "subset",
          asOfDate: "2026-08-02",
        },
      ])[0]?.quantity,
    ).toBe(8_000);
  });

  it("preserves native foreign amounts and rejects unknown values and missing FX as zero", () => {
    const converted = calculateBalanceSheet({
      assets: [{ value: 100, currency: "USD" }],
      liabilities: [{ value: 10, currency: "TWD" }],
      rates: { USD: 32 },
    });
    expect(converted).toMatchObject({
      grossAssets: 3_200,
      totalLiabilities: 10,
      netWorth: 3_190,
    });
    expect(
      calculateBalanceSheet({
        assets: [{ value: null, currency: "USD" }],
        liabilities: [],
        rates: { USD: 32 },
      }).grossAssets,
    ).toBeNull();
    expect(
      calculateBalanceSheet({
        assets: [{ value: 100, currency: "EUR" }],
        liabilities: [],
        rates: {},
      }),
    ).toMatchObject({ grossAssets: null, missingCurrencies: ["EUR"] });
  });
});
