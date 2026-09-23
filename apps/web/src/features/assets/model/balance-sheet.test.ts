import { describe, expect, it } from "vitest";
import {
  calculateBalanceSheet,
  calculateInvestmentPortfolioSummary,
  calculatePersonalBalanceSheet,
  investmentPositionValue,
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

  it("values brokerage cash in its account currency and preserves zero versus unknown", () => {
    const cash = {
      assetType: "cash",
      marketValue: null,
      quantity: null,
      cashBalance: 1_850,
      currency: "USD",
    };
    expect(
      calculatePersonalBalanceSheet({
        bankAccounts: [],
        investments: [cash],
        manualAssets: [],
        liabilities: [],
        rates: { USD: 32 },
      }).grossAssets,
    ).toBe(59_200);
    expect(
      calculatePersonalBalanceSheet({
        bankAccounts: [],
        investments: [{ ...cash, cashBalance: 0 }],
        manualAssets: [],
        liabilities: [],
        rates: {},
      }).grossAssets,
    ).toBe(0);
    expect(
      calculatePersonalBalanceSheet({
        bankAccounts: [],
        investments: [{ ...cash, cashBalance: null }],
        manualAssets: [],
        liabilities: [],
        rates: { USD: 32 },
      }).grossAssets,
    ).toBeNull();
    expect(
      calculatePersonalBalanceSheet({
        bankAccounts: [],
        investments: [cash],
        manualAssets: [],
        liabilities: [],
        rates: {},
      }),
    ).toMatchObject({ grossAssets: null, missingCurrencies: ["USD"] });
  });

  it("does not treat an unknown non-cash market value as a zero cash balance", () => {
    expect(
      investmentPositionValue({
        assetType: "stock",
        marketValue: null,
        cashBalance: 0,
      }),
    ).toBeNull();
    expect(
      investmentPositionValue({
        assetType: "cash",
        marketValue: null,
        cashBalance: 0,
      }),
    ).toBe(0);
  });

  it("shares one net-worth result for assets and overview, including mortgage and card debt", () => {
    const input = {
      bankAccounts: [
        { accountType: "credit", balance: -100_000, currency: "TWD" },
      ],
      investments: [],
      manualAssets: [{ value: 20_000_000, currency: "TWD" }],
      liabilities: [
        {
          liabilityType: "mortgage",
          outstandingPrincipal: 6_000_000,
          accruedInterest: 0,
          currency: "TWD",
        },
      ],
      rates: {},
    };
    const overview = calculatePersonalBalanceSheet(input);
    const assetsPage = calculatePersonalBalanceSheet(input);
    expect(overview.netWorth).toBe(13_900_000);
    expect(assetsPage.netWorth).toBe(overview.netWorth);
    expect(
      calculatePersonalBalanceSheet({
        ...input,
        liabilities: [
          ...input.liabilities,
          {
            liabilityType: "personal_loan",
            outstandingPrincipal: 500_000,
            currency: "TWD",
          },
        ],
      }).netWorth,
    ).toBe(13_400_000);
  });

  it("does not infer overlap from symbols, and uses explicit complete/subset reconciliation", () => {
    const positions = [
      {
        assetType: "stock",
        symbol: "2330",
        marketValue: 3_000,
        currency: "TWD",
      },
      {
        assetType: "stock",
        symbol: "2330",
        marketValue: 5_000,
        currency: "TWD",
      },
    ];
    const unlinked = calculatePersonalBalanceSheet({
      bankAccounts: [],
      investments: positions,
      manualAssets: [],
      liabilities: [],
      rates: {},
    });
    expect(unlinked.grossAssets).toBe(8_000);
    const linked = calculatePersonalBalanceSheet({
      bankAccounts: [],
      investments: [
        {
          ...positions[0]!,
          economicSecurityId: "manual-link:2330",
          observationCoverage: "complete" as const,
        },
        {
          ...positions[1]!,
          economicSecurityId: "manual-link:2330",
          observationCoverage: "subset" as const,
        },
      ],
      manualAssets: [],
      liabilities: [],
      rates: {},
    });
    expect(linked.grossAssets).toBe(3_000);
    const disjoint = calculatePersonalBalanceSheet({
      bankAccounts: [],
      investments: [
        {
          ...positions[0]!,
          economicSecurityId: "explicit:2330",
          observationCoverage: "subset",
        },
        {
          ...positions[1]!,
          economicSecurityId: "explicit:2330",
          observationCoverage: "subset",
        },
      ],
      manualAssets: [],
      liabilities: [],
      rates: {},
    });
    expect(disjoint.grossAssets).toBe(8_000);
  });

  it("treats negative option fair value as a derivative liability and keeps unknowns incomplete", () => {
    expect(
      calculateBalanceSheet({
        assets: [
          { value: -250, currency: "USD", kind: "derivative" },
          { value: -100, currency: "TWD", kind: "derivative" },
        ],
        liabilities: [],
        rates: { USD: 32 },
      }),
    ).toMatchObject({
      grossAssets: 0,
      totalLiabilities: 8_100,
      netWorth: -8_100,
    });
    expect(
      calculateBalanceSheet({
        assets: [{ value: 10, currency: "EUR" }],
        liabilities: [],
        rates: {},
      }).netWorth,
    ).toBeNull();
    expect(
      calculateBalanceSheet({
        assets: [{ value: null, currency: "USD" }],
        liabilities: [],
        rates: { USD: 32 },
      }).grossAssets,
    ).toBeNull();
  });

  it("reconciles explicit complete/subset observations once for portfolio and balance-sheet totals", () => {
    const positions = [
      {
        assetType: "stock",
        marketValue: 8_000,
        currency: "TWD",
        economicSecurityId: "manual:2330:account-1",
        observationCoverage: "complete" as const,
        asOfDate: "2026-09-23",
      },
      {
        assetType: "stock",
        marketValue: 5_000,
        currency: "TWD",
        economicSecurityId: "manual:2330:account-1",
        observationCoverage: "subset" as const,
        asOfDate: "2026-09-23",
      },
    ];
    const portfolio = calculateInvestmentPortfolioSummary(positions, {});
    const balanceSheet = calculatePersonalBalanceSheet({
      bankAccounts: [],
      investments: positions,
      manualAssets: [],
      liabilities: [],
      rates: {},
    });
    expect(portfolio.netValueTwd).toBe(8_000);
    expect(portfolio.grossAssetsTwd).toBe(8_000);
    expect(balanceSheet.grossAssets).toBe(8_000);
  });

  it("keeps negative derivative fair value in portfolio net value and liabilities", () => {
    const positions = [
      { assetType: "option", marketValue: -2_500, currency: "TWD" },
    ];
    expect(calculateInvestmentPortfolioSummary(positions, {})).toMatchObject({
      netValueTwd: -2_500,
      grossAssetsTwd: 0,
      derivativeLiabilitiesTwd: 2_500,
    });
    expect(
      calculatePersonalBalanceSheet({
        bankAccounts: [],
        investments: positions,
        manualAssets: [],
        liabilities: [],
        rates: {},
      }),
    ).toMatchObject({
      grossAssets: 0,
      totalLiabilities: 2_500,
      netWorth: -2_500,
    });
  });

  it("keeps unknown mortgage principal incomplete while accepting zero principal", () => {
    const base = {
      bankAccounts: [],
      investments: [],
      manualAssets: [],
      rates: {},
    };
    expect(
      calculatePersonalBalanceSheet({
        ...base,
        liabilities: [
          {
            liabilityType: "mortgage",
            outstandingPrincipal: null,
            currency: "TWD",
          },
        ],
      }),
    ).toMatchObject({ totalLiabilities: null, netWorth: null });
    expect(
      calculatePersonalBalanceSheet({
        ...base,
        liabilities: [
          {
            liabilityType: "mortgage",
            outstandingPrincipal: 0,
            currency: "TWD",
          },
        ],
      }),
    ).toMatchObject({ totalLiabilities: 0, netWorth: 0 });
  });
});
