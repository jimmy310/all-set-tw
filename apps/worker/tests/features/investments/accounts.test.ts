import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createManualInvestmentAccount,
  createManualInvestmentPosition,
  listInvestmentAccounts,
} from "../../../src/features/investments/repository";
import { createTestD1 } from "../../../../../packages/db/testing/d1";

describe("manual investment accounts and positions", () => {
  let harness: Awaited<ReturnType<typeof createTestD1>>;
  beforeAll(async () => {
    harness = await createTestD1();
  }, 60_000);
  afterAll(async () => harness?.mf.dispose());
  beforeEach(async () => {
    await harness.binding.exec("DELETE FROM investment_accounts");
  });

  it("round trips a masked foreign brokerage account and position", async () => {
    const now = "2026-08-01T12:00:00.000Z";
    await createManualInvestmentAccount(harness.binding, {
      id: "manual-account:ibkr",
      provider: "Synthetic Brokerage",
      accountType: "brokerage",
      displayName: "US Brokerage",
      maskedIdentity: "••8842",
      currency: "USD",
      market: "US",
      now,
    });
    await createManualInvestmentPosition(harness.binding, {
      id: "manual-position:acme",
      accountId: "manual-account:ibkr",
      assetType: "stock",
      symbol: "ACME",
      name: "Synthetic Example Corp.",
      quantity: 2.5,
      marketValue: 375,
      currency: "USD",
      averageCost: 120,
      costBasis: 300,
      custodyStatus: "free",
      asOfDate: "2026-08-01",
      now,
    });

    await expect(listInvestmentAccounts(harness.binding)).resolves.toEqual([
      {
        id: "manual-account:ibkr",
        provider: "Synthetic Brokerage",
        accountType: "brokerage",
        displayName: "US Brokerage",
        maskedIdentity: "••8842",
        currency: "USD",
        market: "US",
      },
    ]);
    await expect(
      harness.binding
        .prepare(
          "SELECT investment_account_id, asset_type, symbol, quantity, market_value, currency, average_cost, cost_basis, custody_status, valuation_source FROM investment_positions WHERE id = ?",
        )
        .bind("manual-position:acme")
        .first(),
    ).resolves.toMatchObject({
      investment_account_id: "manual-account:ibkr",
      asset_type: "stock",
      symbol: "ACME",
      quantity: 2.5,
      market_value: 375,
      currency: "USD",
      average_cost: 120,
      cost_basis: 300,
      custody_status: "free",
      valuation_source: "manual",
    });
  });
});
