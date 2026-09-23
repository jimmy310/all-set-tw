import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../../../../../packages/db/testing/d1";
import * as repository from "../../../src/features/investments/repository";
import { setPositionReconciliation } from "../../../src/features/investments/repository";

const now = "2026-09-12T00:00:00.000Z";

describe("investment repository", () => {
  let harness: Awaited<ReturnType<typeof createTestD1>>;
  beforeAll(async () => {
    harness = await createTestD1();
  }, 60_000);
  afterAll(async () => {
    await harness?.mf.dispose();
  });
  beforeEach(async () => {
    await harness.binding.batch([
      harness.binding.prepare("DELETE FROM investment_transactions"),
      harness.binding.prepare("DELETE FROM investment_positions"),
      harness.binding.prepare("DELETE FROM investment_accounts"),
    ]);
  });

  async function position(input: {
    id: string;
    connectorId?: string;
    sourceId: string;
    assetType: "stock" | "etf" | "fund";
    name: string;
    asOfDate: string;
  }) {
    await harness.binding
      .prepare(
        `INSERT INTO investment_positions (
          id, connector_id, source_id, asset_type, name, currency,
          as_of_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'TWD', ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.connectorId ?? "tdcc",
        input.sourceId,
        input.assetType,
        input.name,
        input.asOfDate,
        now,
        now,
      )
      .run();
  }

  async function trade(input: {
    id: string;
    sourceId: string;
    tradeDate?: string | null;
    postedDate?: string | null;
    updatedAt?: string;
    name?: string;
  }) {
    await harness.binding
      .prepare(
        `INSERT INTO investment_transactions (
          id, connector_id, account_id, source_id, name, currency,
          trade_date, posted_date, created_at, updated_at
        ) VALUES (?, 'tdcc', 'broker', ?, ?, 'TWD', ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.sourceId,
        input.name ?? input.id,
        input.tradeDate ?? null,
        input.postedDate ?? null,
        now,
        input.updatedAt ?? now,
      )
      .run();
  }

  it("lists the latest position per connector and asset type with keyset pagination", async () => {
    const db = harness.binding;
    await position({
      id: "old-stock",
      sourceId: "2330-old",
      assetType: "stock",
      name: "台積電",
      asOfDate: "2026-08-01",
    });
    await position({
      id: "new-stock-b",
      sourceId: "2330-b",
      assetType: "stock",
      name: "台積電B",
      asOfDate: "2026-09-01",
    });
    await position({
      id: "new-stock-a",
      sourceId: "2330-a",
      assetType: "stock",
      name: "台積電A",
      asOfDate: "2026-09-01",
    });
    await position({
      id: "fund",
      connectorId: "manual",
      sourceId: "fund-1",
      assetType: "fund",
      name: "現金",
      asOfDate: "2026-07-01",
    });
    const first = await repository.listLatestInvestmentPositions(db, 2);
    expect(first.map((row) => row.id)).toEqual(["new-stock-a", "new-stock-b"]);
    const next = await repository.listLatestInvestmentPositions(db, 2, {
      asOfDate: first[1].asOfDate,
      assetType: first[1].assetType,
      name: first[1].name,
      id: first[1].id,
    });
    expect(next.map((row) => row.id)).toEqual(["fund"]);
    expect(next.some((row) => row.id === "old-stock")).toBe(false);
  });

  it("pages transactions by effective_date and filters TEXT date ranges", async () => {
    const db = harness.binding;
    await trade({
      id: "aug",
      sourceId: "aug",
      tradeDate: "2026-08-31",
    });
    await trade({
      id: "sep-old",
      sourceId: "sep-old",
      postedDate: "2026-09-01",
      updatedAt: "2026-09-01T01:00:00.000Z",
    });
    await trade({
      id: "sep-new",
      sourceId: "sep-new",
      tradeDate: "2026-09-01",
      updatedAt: "2026-09-01T02:00:00.000Z",
    });
    const first = await repository.listInvestmentTransactions(db, 2);
    expect(first.map((row) => row.id)).toEqual(["sep-new", "sep-old"]);
    const next = await repository.listInvestmentTransactions(db, 2, {
      effectiveDate: first[1].effectiveDate,
      updatedAt: first[1].updatedAt,
      id: first[1].id,
    });
    expect(next.map((row) => row.id)).toEqual(["aug"]);
    const range = { from: "2026-09-01", to: "2026-10-01" };
    expect(
      (await repository.listInvestmentTransactionsInRange(db, range)).map(
        (row) => row.id,
      ),
    ).toEqual(["sep-new", "sep-old"]);
    expect(
      (
        await repository.listInvestmentTransactionsInRange(db, range, [
          "2026-09-01",
        ])
      ).map((row) => row.id),
    ).toEqual(["sep-new", "sep-old"]);
  });

  it("retains latest positions independently for each manual brokerage account and all securities", async () => {
    for (const id of ["ibkr", "yuanta"])
      await harness.binding
        .prepare(
          "INSERT INTO investment_accounts (id, connector_id, source_id, provider, account_type, display_name, currency, created_at, updated_at) VALUES (?, 'manual', ?, 'broker', 'brokerage', ?, 'USD', ?, ?)",
        )
        .bind(id, id, id, now, now)
        .run();
    for (const [id, accountId, date] of [
      ["ibkr-tsm", "ibkr", "2026-09-23"],
      ["ibkr-aapl", "ibkr", "2026-09-23"],
      ["yuanta-tsm", "yuanta", "2026-09-22"],
      ["yuanta-msft", "yuanta", "2026-09-22"],
    ])
      await harness.binding
        .prepare(
          "INSERT INTO investment_positions (id, connector_id, source_id, asset_type, name, currency, as_of_date, created_at, updated_at, investment_account_id) VALUES (?, 'manual', ?, 'stock', ?, 'USD', ?, ?, ?, ?)",
        )
        .bind(id, id, id, date, now, now, accountId)
        .run();
    expect(
      (await repository.listLatestInvestmentPositions(harness.binding, 20))
        .map((row) => row.id)
        .sort(),
    ).toEqual(["ibkr-tsm", "ibkr-aapl", "yuanta-tsm", "yuanta-msft"].sort());
  });

  it("accepts option transaction type and contract identity metadata", async () => {
    await trade({
      id: "option-trade",
      sourceId: "option-trade",
      tradeDate: "2026-09-23",
    });
    await harness.binding
      .prepare(
        "UPDATE investment_transactions SET asset_type = 'option', underlying_symbol = 'TSM', expiration_date = '2028-12-15', strike_price = 280, option_right = 'call', contract_symbol = 'TSM281215C00280000', external_contract_id = 'broker-contract-1' WHERE id = 'option-trade'",
      )
      .run();
    const [transaction] = await repository.listInvestmentTransactions(
      harness.binding,
      10,
    );
    expect(transaction).toMatchObject({
      assetType: "option",
      underlyingSymbol: "TSM",
      expirationDate: "2028-12-15",
      strikePrice: 280,
      optionRight: "call",
      contractSymbol: "TSM281215C00280000",
      externalContractId: "broker-contract-1",
    });
  });

  it("stores explicit economic identity and observation coverage without matching on symbol", async () => {
    await position({
      id: "linked-source",
      sourceId: "source:2330",
      assetType: "stock",
      name: "2330",
      asOfDate: "2026-09-23",
    });
    await setPositionReconciliation(
      harness.binding,
      "linked-source",
      "manual-economic-id:2330:account-a",
      "subset",
    );
    const [row] = await repository.listLatestInvestmentPositions(
      harness.binding,
      10,
    );
    expect(row).toMatchObject({
      economicSecurityId: "manual-economic-id:2330:account-a",
      observationCoverage: "subset",
      sourceId: "source:2330",
      connectorId: "tdcc",
    });
  });
});
