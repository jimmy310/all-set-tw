import { describe, expect, it } from "vitest";
import { calculateAssetSummary } from "./summary";

describe("calculateAssetSummary", () => {
  it("uses the reconciled economic total for the Assets summary and balance sheet", () => {
    const summary = calculateAssetSummary({
      bank: { accounts: [], transactions: [] },
      investments: [
        {
          id: "broker-complete",
          assetType: "stock",
          name: "2330",
          marketValue: 8_000,
          currency: "TWD",
          asOfDate: "2026-09-23",
          economicSecurityId: "security:2330",
          observationCoverage: "complete",
        },
        {
          id: "custody-subset",
          assetType: "stock",
          name: "2330 collateral",
          marketValue: 5_000,
          currency: "TWD",
          asOfDate: "2026-09-23",
          economicSecurityId: "security:2330",
          observationCoverage: "subset",
        },
      ],
      manualAssets: [],
      rates: [],
    });
    expect(summary.investmentTotal).toBe(8_000);
    expect(summary.investmentGrossAssets).toBe(8_000);
    expect(summary.grossAssets).toBe(8_000);
  });

  it("reports investment net value separately from gross assets for short options", () => {
    const summary = calculateAssetSummary({
      bank: { accounts: [], transactions: [] },
      investments: [
        {
          id: "short-call",
          assetType: "option",
          name: "TSM Call",
          quantity: -1,
          marketValue: -2_500,
          currency: "TWD",
          asOfDate: "2026-09-23",
        },
      ],
      manualAssets: [],
      rates: [],
    });
    expect(summary.investmentTotal).toBe(-2_500);
    expect(summary.investmentGrossAssets).toBe(0);
    expect(summary.totalLiabilities).toBe(2_500);
    expect(summary.netWorth).toBe(-2_500);
  });

  it("converts balances and groups accounts and cards by institution", () => {
    const summary = calculateAssetSummary({
      bank: {
        accounts: [
          {
            id: "deposit",
            connectorId: "esun",
            sourceId: "deposit",
            institutionName: "玉山銀行",
            bankCode: "808",
            accountType: "savings",
            balance: 100,
            currency: "USD",
          },
          {
            id: "card",
            connectorId: "esun",
            sourceId: "card",
            institutionName: "玉山銀行",
            bankCode: "808",
            accountType: "credit",
            balance: -2_000,
            currency: "TWD",
          },
        ],
        transactions: [],
      },
      investments: [
        {
          id: "investment",
          assetType: "stock",
          name: "測試持倉",
          marketValue: 10_000,
          currency: "TWD",
          asOfDate: "2026-07-22",
        },
      ],
      manualAssets: [
        {
          id: "home",
          name: "房屋",
          category: "real_estate",
          note: null,
          currency: "USD",
          createdAt: "2026-07-22",
          value: 200,
        },
      ],
      rates: [{ currency: "USD", rateTwd: 30, updatedAt: "2026-07-22" }],
    });

    expect(summary.bankTotal).toBe(3_000);
    expect(summary.cardDebt).toBe(2_000);
    expect(summary.netWorth).toBe(17_000);
    expect(summary.institutionGroups).toHaveLength(1);
    expect(summary.institutionGroups[0]).toMatchObject({
      key: "bank:808",
      institution: "玉山銀行",
      assetTotalTwd: 3_000,
      debtTotalTwd: 2_000,
    });
    expect(summary.institutionGroups[0]?.accounts).toHaveLength(1);
    expect(summary.institutionGroups[0]?.cards).toHaveLength(1);
    expect(summary.missingCurrencies).toEqual([]);
  });

  it("reports currencies omitted from TWD totals when exchange rates are missing", () => {
    const summary = calculateAssetSummary({
      bank: {
        accounts: [
          {
            id: "foreign",
            connectorId: "obank",
            sourceId: "foreign",
            accountType: "savings",
            balance: 100,
            currency: "USD",
          },
        ],
        transactions: [],
      },
      investments: [],
      manualAssets: [
        {
          id: "yen",
          name: "日圓資產",
          category: "other",
          note: null,
          currency: "JPY",
          createdAt: "2026-08-09",
          value: 10_000,
        },
      ],
      rates: [],
    });

    expect(summary.grossAssets).toBeNull();
    expect(summary.missingCurrencies).toEqual(["JPY", "USD"]);
  });

  it("ignores empty foreign accounts while preserving non-zero card debt warnings", () => {
    const summary = calculateAssetSummary({
      bank: {
        accounts: [
          {
            id: "empty-hkd",
            connectorId: "esun",
            sourceId: "empty-hkd",
            accountType: "savings",
            balance: 0,
            currency: "HKD",
          },
          {
            id: "overdrawn-cny",
            connectorId: "esun",
            sourceId: "overdrawn-cny",
            accountType: "savings",
            balance: -10,
            currency: "CNY",
          },
          {
            id: "empty-card",
            connectorId: "esun",
            sourceId: "empty-card",
            accountType: "credit",
            balance: 0,
            currency: "AUD",
          },
          {
            id: "foreign-card",
            connectorId: "esun",
            sourceId: "foreign-card",
            accountType: "credit",
            balance: -50,
            currency: "SGD",
          },
        ],
        transactions: [],
      },
      investments: [
        {
          id: "empty-investment",
          assetType: "fund",
          name: "空投資部位",
          marketValue: 0,
          cashBalance: 0,
          currency: "GBP",
          asOfDate: "2026-08-12",
        },
      ],
      manualAssets: [
        {
          id: "empty-manual",
          name: "零估值資產",
          category: "other",
          note: null,
          currency: "CHF",
          createdAt: "2026-08-12",
          value: 0,
        },
      ],
      rates: [],
    });

    expect(summary.missingCurrencies).toEqual(["CNY", "SGD"]);
  });

  it("includes mortgage and credit-card balances in the same Assets-page net worth", () => {
    const summary = calculateAssetSummary({
      bank: {
        accounts: [
          {
            id: "card",
            connectorId: "esun",
            sourceId: "card",
            accountType: "credit",
            balance: -100_000,
            currency: "TWD",
          },
        ],
        transactions: [],
      },
      investments: [],
      manualAssets: [
        {
          id: "home",
          name: "House",
          category: "real_estate",
          note: null,
          currency: "TWD",
          createdAt: "2026-09-23",
          value: 20_000_000,
        },
      ],
      liabilities: [
        {
          liabilityType: "mortgage",
          outstandingPrincipal: 6_000_000,
          accruedInterest: 0,
          currency: "TWD",
        },
      ],
      rates: [],
    });
    expect(summary.netWorth).toBe(13_900_000);
  });
});
