import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createManualInvestmentAccount,
  createManualInvestmentPosition,
  listInvestmentAccounts,
  updateManualInvestmentAccount,
  deleteManualInvestmentAccount,
  updateManualInvestmentPosition,
  deleteManualInvestmentPosition,
} from "../../../src/features/investments/repository";
import { createTestD1 } from "../../../../../packages/db/testing/d1";
import {
  addManualInvestmentPosition,
  editManualInvestmentPosition,
  linkPositionReconciliation,
} from "../../../src/features/investments/service";
import { manualPositionSchema } from "../../../src/features/investments/route";

describe("manual investment accounts and positions", () => {
  let harness: Awaited<ReturnType<typeof createTestD1>>;
  beforeAll(async () => {
    harness = await createTestD1();
  }, 60_000);
  afterAll(async () => harness?.mf.dispose());
  beforeEach(async () => {
    await harness.binding.exec("DELETE FROM investment_positions");
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

  it("supports safe account and position CRUD with signed US option metadata", async () => {
    const now = "2026-09-23T00:00:00.000Z";
    await createManualInvestmentAccount(harness.binding, {
      id: "manual-account:options",
      provider: "Broker",
      accountType: "brokerage",
      displayName: "Options",
      maskedIdentity: null,
      currency: "USD",
      market: "US",
      now,
    });
    await createManualInvestmentPosition(harness.binding, {
      id: "manual-position:short-put",
      accountId: "manual-account:options",
      assetType: "option",
      symbol: null,
      name: "TSM 2028-12-15 280 Put",
      quantity: -2,
      marketValue: -12_500,
      currency: "USD",
      averageCost: 62.5,
      costBasis: 12_500,
      custodyStatus: "free",
      asOfDate: "2026-09-23",
      now,
      underlyingSymbol: "TSM",
      expirationDate: "2028-12-15",
      strikePrice: 280,
      optionRight: "put",
      contractMultiplier: 100,
      contractSymbol: "TSM 281215P00280000",
      optionMarkPrice: 62.5,
    });
    const changed = await updateManualInvestmentAccount(
      harness.binding,
      "manual-account:options",
      {
        provider: "Broker",
        accountType: "brokerage",
        displayName: "Updated Options",
        maskedIdentity: null,
        currency: "USD",
        market: "US",
      },
      now,
    );
    expect(changed).toBeDefined();
    expect(
      await deleteManualInvestmentAccount(
        harness.binding,
        "manual-account:options",
      ),
    ).toBe(false);
    await updateManualInvestmentPosition(
      harness.binding,
      "manual-position:short-put",
      {
        accountId: "manual-account:options",
        assetType: "option",
        symbol: null,
        name: "TSM 2028-12-15 280 Put",
        quantity: -2,
        marketValue: -12_500,
        currency: "USD",
        averageCost: 62.5,
        costBasis: 12_500,
        custodyStatus: "free",
        asOfDate: "2026-09-23",
        underlyingSymbol: "TSM",
        expirationDate: "2028-12-15",
        strikePrice: 280,
        optionRight: "put",
        contractMultiplier: 100,
        contractSymbol: "TSM 281215P00280000",
        optionMarkPrice: 62.5,
        economicSecurityId: null,
        observationCoverage: "complete",
      },
      now,
    );
    const row = await harness.binding
      .prepare("SELECT * FROM investment_positions WHERE id = ?")
      .bind("manual-position:short-put")
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      quantity: -2,
      market_value: -12500,
      option_right: "put",
      strike_price: 280,
      contract_multiplier: 100,
      underlying_symbol: "TSM",
    });
    const optionIds: string[] = [];
    for (const item of [
      {
        id: "call-long",
        right: "call",
        name: "TSM 2028-12-15 280 Call",
        mark: 12.5,
        quantity: 2,
      },
      {
        id: "put-long",
        right: "put",
        name: "TSM 2028-12-15 280 Put",
        mark: 8.25,
        quantity: 2,
      },
      {
        id: "call-short",
        right: "call",
        name: "TSM 2028-12-15 280 Call short",
        mark: 12.5,
        quantity: -1,
      },
    ]) {
      const positionId = await addManualInvestmentPosition(harness.binding, {
        accountId: "manual-account:options",
        assetType: "option",
        symbol: null,
        name: item.name,
        quantity: item.quantity,
        marketValue: null,
        currency: "USD",
        averageCost: item.mark,
        costBasis: null,
        custodyStatus: "free",
        asOfDate: "2026-09-23",
        underlyingSymbol: "TSM",
        expirationDate: "2028-12-15",
        strikePrice: 280,
        optionRight: item.right,
        contractMultiplier: 100,
        optionMarkPrice: item.mark,
      });
      expect(positionId).not.toBeNull();
      if (!positionId) throw new Error("Manual option account should exist");
      optionIds.push(positionId);
    }
    const options = await harness.binding
      .prepare(
        "SELECT id, quantity, market_value, option_right, expiration_date, strike_price, contract_multiplier FROM investment_positions WHERE asset_type = 'option'",
      )
      .all();
    expect(options.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: optionIds[0],
          quantity: 2,
          market_value: 2500,
          option_right: "call",
          expiration_date: "2028-12-15",
          strike_price: 280,
          contract_multiplier: 100,
        }),
        expect.objectContaining({
          id: optionIds[1],
          quantity: 2,
          market_value: 1650,
          option_right: "put",
          expiration_date: "2028-12-15",
          strike_price: 280,
          contract_multiplier: 100,
        }),
        expect.objectContaining({
          id: optionIds[2],
          quantity: -1,
          market_value: -1250,
          option_right: "call",
        }),
      ]),
    );
    expect(
      await deleteManualInvestmentPosition(
        harness.binding,
        "manual-position:short-put",
      ),
    ).toBe(true);
    expect(
      await deleteManualInvestmentAccount(
        harness.binding,
        "manual-account:options",
      ),
    ).toBe(false);
    for (const id of optionIds)
      await deleteManualInvestmentPosition(harness.binding, id);
    expect(
      await deleteManualInvestmentAccount(
        harness.binding,
        "manual-account:options",
      ),
    ).toBe(true);
  });

  it("round trips positive, zero, and unknown brokerage cash without quantity or market value", async () => {
    const now = "2026-09-23T00:00:00.000Z";
    await createManualInvestmentAccount(harness.binding, {
      id: "manual-account:cash",
      provider: "IBKR",
      accountType: "brokerage",
      displayName: "IBKR",
      maskedIdentity: null,
      currency: "USD",
      market: "US",
      now,
    });
    const base = {
      accountId: "manual-account:cash",
      assetType: "cash",
      name: "USD Cash",
      currency: "USD",
      custodyStatus: "free",
      asOfDate: "2026-09-23",
    };
    const requestBase = {
      ...base,
      accountId: base.accountId,
      asOfDate: base.asOfDate,
    };
    expect(
      manualPositionSchema.safeParse({ ...requestBase, cashBalance: 1_850 })
        .success,
    ).toBe(true);
    expect(
      manualPositionSchema.safeParse({ ...requestBase, cashBalance: 0 })
        .success,
    ).toBe(true);
    expect(
      manualPositionSchema.safeParse({ ...requestBase, cashBalance: null })
        .success,
    ).toBe(true);
    expect(
      manualPositionSchema.safeParse({ ...requestBase, cashBalance: -1 })
        .success,
    ).toBe(false);
    const positiveId = await addManualInvestmentPosition(harness.binding, {
      ...base,
      cashBalance: 1_850,
    });
    const zeroId = await addManualInvestmentPosition(harness.binding, {
      ...base,
      name: "Zero cash",
      cashBalance: 0,
    });
    const unknownId = await addManualInvestmentPosition(harness.binding, {
      ...base,
      name: "Unknown cash",
      cashBalance: null,
    });
    expect(positiveId).not.toBeNull();
    expect(zeroId).not.toBeNull();
    expect(unknownId).not.toBeNull();
    expect(
      await harness.binding
        .prepare(
          `SELECT asset_type, quantity, market_value, cash_balance, currency
           FROM investment_positions WHERE id = ?`,
        )
        .bind(positiveId)
        .first(),
    ).toEqual({
      asset_type: "cash",
      quantity: null,
      market_value: null,
      cash_balance: 1_850,
      currency: "USD",
    });
    expect(
      await harness.binding
        .prepare("SELECT cash_balance FROM investment_positions WHERE id = ?")
        .bind(zeroId)
        .first(),
    ).toEqual({ cash_balance: 0 });
    expect(
      await harness.binding
        .prepare("SELECT cash_balance FROM investment_positions WHERE id = ?")
        .bind(unknownId)
        .first(),
    ).toEqual({ cash_balance: null });
    expect(
      await editManualInvestmentPosition(harness.binding, positiveId!, {
        ...base,
        cashBalance: 2_000,
      }),
    ).toBe(true);
    expect(
      await harness.binding
        .prepare("SELECT cash_balance FROM investment_positions WHERE id = ?")
        .bind(positiveId)
        .first(),
    ).toEqual({ cash_balance: 2_000 });
  });

  it("clears option defaults from non-option positions at the service boundary", async () => {
    const now = "2026-09-23T00:00:00.000Z";
    await createManualInvestmentAccount(harness.binding, {
      id: "manual-account:stock",
      provider: "Broker",
      accountType: "brokerage",
      displayName: "Stocks",
      maskedIdentity: null,
      currency: "USD",
      market: "US",
      now,
    });
    const id = await addManualInvestmentPosition(harness.binding, {
      accountId: "manual-account:stock",
      assetType: "stock",
      symbol: "TSM",
      name: "Taiwan Semiconductor",
      quantity: 1,
      marketValue: 100,
      cashBalance: 500,
      currency: "USD",
      custodyStatus: "free",
      asOfDate: "2026-09-23",
      underlyingSymbol: "TSM",
      expirationDate: "2028-12-15",
      strikePrice: 280,
      optionRight: "call",
      contractMultiplier: 100,
      contractSymbol: "TSM281215C00280000",
      optionMarkPrice: 12.5,
    });
    expect(id).not.toBeNull();
    expect(
      await harness.binding
        .prepare(
          `SELECT cash_balance, underlying_symbol, expiration_date,
                  strike_price, option_right, contract_multiplier,
                  contract_symbol, option_mark_price
           FROM investment_positions WHERE id = ?`,
        )
        .bind(id)
        .first(),
    ).toEqual({
      cash_balance: null,
      underlying_symbol: null,
      expiration_date: null,
      strike_price: null,
      option_right: null,
      contract_multiplier: 1,
      contract_symbol: null,
      option_mark_price: null,
    });
  });

  it("rejects nonexistent or connector-owned accounts and never mutates connector positions", async () => {
    const now = "2026-09-23T00:00:00.000Z";
    await createManualInvestmentAccount(harness.binding, {
      id: "manual-account:ownership",
      provider: "Broker",
      accountType: "brokerage",
      displayName: "Manual",
      maskedIdentity: null,
      currency: "USD",
      market: "US",
      now,
    });
    await harness.binding
      .prepare(
        `INSERT INTO investment_accounts
         (id, connector_id, source_id, provider, account_type, display_name,
          currency, created_at, updated_at)
         VALUES ('connector-account', 'tdcc', 'source-account', 'TDCC',
          'brokerage', 'Connector', 'TWD', ?, ?)`,
      )
      .bind(now, now)
      .run();
    const input = {
      assetType: "stock",
      name: "Protected",
      quantity: 1,
      marketValue: 100,
      currency: "TWD",
      custodyStatus: "free",
      asOfDate: "2026-09-23",
    };
    await expect(
      addManualInvestmentPosition(harness.binding, {
        ...input,
        accountId: "does-not-exist",
      }),
    ).resolves.toBeNull();
    await expect(
      addManualInvestmentPosition(harness.binding, {
        ...input,
        accountId: "connector-account",
      }),
    ).resolves.toBeNull();

    await harness.binding
      .prepare(
        `INSERT INTO investment_positions
         (id, connector_id, source_id, investment_account_id, asset_type, name,
          quantity, market_value, currency, as_of_date, created_at, updated_at)
         VALUES ('connector-position', 'tdcc', 'connector-source',
          'connector-account', 'stock', 'Original', 2, 200, 'TWD',
          '2026-09-22', ?, ?)`,
      )
      .bind(now, now)
      .run();
    expect(
      await editManualInvestmentPosition(
        harness.binding,
        "connector-position",
        { ...input, accountId: "manual-account:ownership", name: "Changed" },
      ),
    ).toBe(false);
    expect(
      await updateManualInvestmentAccount(
        harness.binding,
        "connector-account",
        {
          provider: "Changed",
          accountType: "brokerage",
          displayName: "Changed",
          maskedIdentity: null,
          currency: "TWD",
          market: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      await deleteManualInvestmentAccount(harness.binding, "connector-account"),
    ).toBe(false);
    expect(
      await linkPositionReconciliation(harness.binding, "connector-position", {
        economicSecurityId: "forged-link",
        observationCoverage: "subset",
      }),
    ).toBe(false);
    expect(
      await harness.binding
        .prepare(
          "SELECT name, investment_account_id FROM investment_positions WHERE id = 'connector-position'",
        )
        .first(),
    ).toEqual({ name: "Original", investment_account_id: "connector-account" });
  });
});
