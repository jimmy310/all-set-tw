import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../../../../../packages/db/testing/d1";
import {
  getInvestmentPage,
  linkPositionReconciliation,
  resolveInvestmentReconciliationOverrides,
  unlinkPositionReconciliation,
} from "../../../src/features/investments/service";

const now = "2026-09-23T00:00:00.000Z";

describe("investment reconciliation overrides", () => {
  let harness: Awaited<ReturnType<typeof createTestD1>>;

  beforeAll(async () => {
    harness = await createTestD1();
  }, 60_000);
  afterAll(async () => harness?.mf.dispose());
  beforeEach(async () => {
    await harness.binding.batch([
      harness.binding.prepare(
        "DELETE FROM investment_reconciliation_overrides",
      ),
      harness.binding.prepare("DELETE FROM investment_positions"),
      harness.binding.prepare("DELETE FROM investment_accounts"),
    ]);
  });

  async function position(input: {
    id: string;
    connectorId: string;
    sourcePositionKey: string | null;
    sourceEconomicSecurityId?: string | null;
    sourceObservationCoverage?: "complete" | "subset";
    symbol?: string;
  }) {
    await harness.binding
      .prepare(
        `INSERT INTO investment_positions
         (id, connector_id, source_id, source_position_key, asset_type, symbol,
          name, quantity, market_value, currency, as_of_date,
          economic_security_id, observation_coverage, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'stock', ?, 'TSMC', 100, 1000, 'TWD', ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.connectorId,
        `source:${input.id}`,
        input.sourcePositionKey,
        input.symbol ?? "2330",
        "2026-09-23",
        input.sourceEconomicSecurityId ?? null,
        input.sourceObservationCoverage ?? "complete",
        now,
        now,
      )
      .run();
  }

  it("stores connector mappings separately, applies them, and removes them without source mutation", async () => {
    await position({
      id: "position:tdcc:2330",
      connectorId: "tdcc",
      // This is the source key that migration 0050 derives from an existing
      // TDCC source ID ending in :2026-09-23.
      sourcePositionKey: "007:1234567:2330",
      sourceEconomicSecurityId: "source:tdcc:2330",
      sourceObservationCoverage: "complete",
    });

    expect(
      await linkPositionReconciliation(harness.binding, "position:tdcc:2330", {
        economicSecurityId: "owner-1:2330",
        observationCoverage: "subset",
      }),
    ).toBe(true);
    const linked = await getInvestmentPage(harness.binding, 20);
    expect(linked.positions[0]).toMatchObject({
      connectorId: "tdcc",
      economicSecurityId: "owner-1:2330",
      observationCoverage: "subset",
      sourceEconomicSecurityId: "source:tdcc:2330",
      sourceObservationCoverage: "complete",
      hasReconciliationOverride: true,
    });
    expect(
      await harness.binding
        .prepare(
          `SELECT economic_security_id, observation_coverage
           FROM investment_positions WHERE id = 'position:tdcc:2330'`,
        )
        .first(),
    ).toEqual({
      economic_security_id: "source:tdcc:2330",
      observation_coverage: "complete",
    });

    expect(
      await unlinkPositionReconciliation(harness.binding, "position:tdcc:2330"),
    ).toBe(true);
    const unlinked = await getInvestmentPage(harness.binding, 20);
    expect(unlinked.positions[0]).toMatchObject({
      economicSecurityId: "source:tdcc:2330",
      observationCoverage: "complete",
      hasReconciliationOverride: false,
    });
  });

  it("requires an existing position with a stable source identity", async () => {
    await position({
      id: "no-stable-key",
      connectorId: "broker-a",
      sourcePositionKey: null,
    });
    expect(
      await linkPositionReconciliation(harness.binding, "missing-position", {
        economicSecurityId: "owner:2330",
        observationCoverage: "subset",
      }),
    ).toBe(false);
    expect(
      await linkPositionReconciliation(harness.binding, "no-stable-key", {
        economicSecurityId: "owner:2330",
        observationCoverage: "subset",
      }),
    ).toBe(false);
    expect(
      await harness.binding
        .prepare(
          "SELECT COUNT(*) AS count FROM investment_reconciliation_overrides",
        )
        .first(),
    ).toEqual({ count: 0 });
  });

  it.each([
    {
      name: "TDCC and securities finance provider",
      providers: ["tdcc", "securities-finance-a"],
      coverages: ["subset", "subset"],
    },
    {
      name: "TDCC and brokerage collateral provider",
      providers: ["tdcc", "broker-collateral-b"],
      coverages: ["subset", "subset"],
    },
    {
      name: "complete broker and bank collateral subset",
      providers: ["broker-c", "bank-custody-d"],
      coverages: ["complete", "subset"],
    },
    {
      name: "manual and connector observations",
      providers: ["manual", "custodian-e"],
      coverages: ["subset", "subset"],
    },
    {
      name: "two manual observations",
      providers: ["manual", "manual"],
      coverages: ["subset", "subset"],
    },
  ])(
    "resolves explicit provider-neutral links for $name",
    ({ providers, coverages }) => {
      const positions = providers.map((connectorId, index) => ({
        id: `${connectorId}:2330`,
        connectorId,
        providerName: `Provider ${index}`,
        sourcePositionKey: `account-${index}:2330`,
        symbol: "2330",
        economicSecurityId:
          coverages[index] === "complete" ? "owner:2330" : null,
        observationCoverage: coverages[index]!,
      }));
      const overrides = providers
        .map((connectorId, index) =>
          coverages[index] === "complete"
            ? null
            : {
                connectorId,
                sourcePositionKey: `account-${index}:2330`,
                economicSecurityId: "owner:2330",
                observationCoverage: coverages[index]!,
              },
        )
        .filter((value) => value !== null);

      const resolved = resolveInvestmentReconciliationOverrides(
        positions,
        overrides,
      );
      expect(resolved.map((position) => position.economicSecurityId)).toEqual([
        "owner:2330",
        "owner:2330",
      ]);
      expect(resolved.map((position) => position.observationCoverage)).toEqual(
        coverages,
      );
    },
  );

  it("does not infer links from matching symbols and keeps source metadata unless overridden", () => {
    const positions = [
      {
        connectorId: "broker-a",
        sourcePositionKey: "acct-a:2330",
        symbol: "2330",
        economicSecurityId: "source-group:1",
        observationCoverage: "complete",
      },
      {
        connectorId: "bank-b",
        sourcePositionKey: "acct-b:2330",
        symbol: "2330",
        economicSecurityId: null,
        observationCoverage: "subset",
      },
      {
        connectorId: "broker-c",
        sourcePositionKey: "acct-c:2330",
        symbol: "2330",
        economicSecurityId: null,
        observationCoverage: "complete",
      },
    ];
    const resolved = resolveInvestmentReconciliationOverrides(positions, [
      {
        connectorId: "bank-b",
        sourcePositionKey: "acct-b:2330",
        economicSecurityId: "source-group:1",
        observationCoverage: "subset",
      },
      {
        connectorId: "broker-a",
        sourcePositionKey: "acct-a:2330",
        economicSecurityId: "user-group:override",
        observationCoverage: "subset",
      },
    ]);

    expect(resolved.map((position) => position.economicSecurityId)).toEqual([
      "user-group:override",
      "source-group:1",
      null,
    ]);
    expect(
      resolved.map((position) => position.hasReconciliationOverride),
    ).toEqual([true, true, false]);
    expect(resolved[0]).toMatchObject({
      sourceEconomicSecurityId: "source-group:1",
      sourceObservationCoverage: "complete",
    });
  });
});
