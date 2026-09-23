import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createLiability,
  deleteLiability,
  listLiabilities,
  updateLiability,
  createCollateralRelationship,
  deleteCollateralRelationship,
  listCollateralRelationships,
} from "../../../src/features/liabilities/repository";
import { addCollateralRelationship } from "../../../src/features/liabilities/service";
import {
  createManualAsset,
  deleteManualAsset,
} from "../../../src/features/manual-assets/repository";
import {
  createManualInvestmentAccount,
  createManualInvestmentPosition,
  deleteManualInvestmentPosition,
} from "../../../src/features/investments/repository";
import { createTestD1 } from "../../../../../packages/db/testing/d1";

describe("liability repository", () => {
  let harness: Awaited<ReturnType<typeof createTestD1>>;
  beforeAll(async () => {
    harness = await createTestD1();
  }, 60_000);
  afterAll(async () => harness?.mf.dispose());
  beforeEach(async () => {
    await harness.binding.exec("DELETE FROM liability_accounts");
  });

  it("round trips a mortgage and keeps unknown principal distinct from zero", async () => {
    await createLiability(harness.binding, {
      id: "manual-liability:home-loan",
      liabilityType: "mortgage",
      provider: "Synthetic Bank",
      name: "Home loan",
      maskedIdentity: "••1234",
      currency: "TWD",
      originalPrincipal: 8_000_000,
      interestRate: 2.1,
      interestRateType: "variable",
      startDate: "2025-01-01",
      maturityDate: null,
      monthlyPayment: 30_000,
      nextPaymentDate: null,
      outstandingPrincipal: 6_000_000,
      accruedInterest: null,
      asOfAt: "2026-08-01T23:59:59.999Z",
      now: "2026-08-02T00:00:00.000Z",
    });
    await createLiability(harness.binding, {
      id: "manual-liability:unknown-loan",
      liabilityType: "personal_loan",
      provider: null,
      name: "Unknown balance loan",
      maskedIdentity: null,
      currency: "USD",
      originalPrincipal: null,
      interestRate: null,
      interestRateType: null,
      startDate: null,
      maturityDate: null,
      monthlyPayment: null,
      nextPaymentDate: null,
      outstandingPrincipal: null,
      accruedInterest: null,
      asOfAt: "2026-08-02T23:59:59.999Z",
      now: "2026-08-02T00:00:00.000Z",
    });

    await expect(listLiabilities(harness.binding)).resolves.toEqual([
      expect.objectContaining({
        id: "manual-liability:home-loan",
        liabilityType: "mortgage",
        originalPrincipal: 8_000_000,
        outstandingPrincipal: 6_000_000,
        accruedInterest: null,
        currency: "TWD",
      }),
      expect.objectContaining({
        id: "manual-liability:unknown-loan",
        liabilityType: "personal_loan",
        outstandingPrincipal: null,
        currency: "USD",
      }),
    ]);
  });

  it("adds dated balance observations and deletes dependent collateral links", async () => {
    await createLiability(harness.binding, {
      id: "manual-liability:pledge",
      liabilityType: "securities_backed_loan",
      provider: null,
      name: "Pledge loan",
      maskedIdentity: null,
      currency: "TWD",
      originalPrincipal: 1_000,
      interestRate: null,
      interestRateType: null,
      startDate: null,
      maturityDate: null,
      monthlyPayment: null,
      nextPaymentDate: null,
      outstandingPrincipal: 1_000,
      accruedInterest: null,
      asOfAt: "2026-08-01T23:59:59.999Z",
      now: "2026-08-02T00:00:00.000Z",
    });
    await harness.binding
      .prepare(
        "INSERT INTO collateral_relationships (id, liability_account_id, asset_type, asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        "pledge-1",
        "manual-liability:pledge",
        "investment_position",
        "holding-1",
        "now",
        "now",
      )
      .run();
    await expect(listCollateralRelationships(harness.binding)).resolves.toEqual(
      [
        expect.objectContaining({
          liabilityAccountId: "manual-liability:pledge",
          assetType: "investment_position",
          assetId: "holding-1",
        }),
      ],
    );
    await updateLiability(
      harness.binding,
      "manual-liability:pledge",
      {
        outstandingPrincipal: 900,
        accruedInterest: 10,
        asOfAt: "2026-08-03T23:59:59.999Z",
      },
      "2026-08-04T00:00:00.000Z",
    );
    await expect(listLiabilities(harness.binding)).resolves.toEqual([
      expect.objectContaining({
        outstandingPrincipal: 900,
        accruedInterest: 10,
      }),
    ]);
    await deleteLiability(harness.binding, "manual-liability:pledge");
    await expect(
      harness.binding.prepare("SELECT id FROM collateral_relationships").all(),
    ).resolves.toMatchObject({ results: [] });
  });

  it("creates, reads, and deletes a manual home collateral link while preserving asset and loan accounting", async () => {
    await createLiability(harness.binding, {
      id: "manual-liability:mortgage",
      liabilityType: "mortgage",
      provider: null,
      name: "House mortgage",
      maskedIdentity: null,
      currency: "TWD",
      originalPrincipal: 8_000_000,
      interestRate: null,
      interestRateType: null,
      startDate: null,
      maturityDate: null,
      monthlyPayment: null,
      nextPaymentDate: null,
      outstandingPrincipal: 6_000_000,
      accruedInterest: null,
      asOfAt: "2026-09-23T23:59:59.999Z",
      now: "2026-09-23T00:00:00.000Z",
    });
    await createCollateralRelationship(harness.binding, {
      id: "link-house",
      liabilityAccountId: "manual-liability:mortgage",
      assetType: "manual_asset",
      assetId: "house-1",
      collateralValue: 20_000_000,
      currency: "TWD",
      now: "2026-09-23T00:00:00.000Z",
    });
    expect(await listCollateralRelationships(harness.binding)).toHaveLength(1);
    await expect(listLiabilities(harness.binding)).resolves.toEqual([
      expect.objectContaining({
        id: "manual-liability:mortgage",
        outstandingPrincipal: 6_000_000,
      }),
    ]);
    await deleteCollateralRelationship(harness.binding, "link-house");
    expect(await listCollateralRelationships(harness.binding)).toHaveLength(0);
  });

  it("validates collateral targets and preserves colon-containing IDs through link/unlink", async () => {
    const now = "2026-09-23T00:00:00.000Z";
    await createLiability(harness.binding, {
      id: "manual-liability:colon-targets",
      liabilityType: "mortgage",
      provider: null,
      name: "Collateral targets",
      maskedIdentity: null,
      currency: "TWD",
      originalPrincipal: 1_000,
      interestRate: null,
      interestRateType: null,
      startDate: null,
      maturityDate: null,
      monthlyPayment: null,
      nextPaymentDate: null,
      outstandingPrincipal: 800,
      accruedInterest: null,
      asOfAt: now,
      now,
    });
    await createManualAsset(harness.binding, {
      id: "manual:1234-5678",
      name: "Colon House",
      category: "real_estate",
      note: null,
      currency: "TWD",
      value: 5_000,
      date: "2026-09-23",
      now,
    });
    await createManualInvestmentAccount(harness.binding, {
      id: "manual-investment-account:colon-target",
      provider: "Broker",
      accountType: "brokerage",
      displayName: "Colon account",
      maskedIdentity: null,
      currency: "USD",
      market: "US",
      now,
    });
    await createManualInvestmentPosition(harness.binding, {
      id: "manual-investment-position:abcd-efgh",
      accountId: "manual-investment-account:colon-target",
      assetType: "stock",
      symbol: "TSM",
      name: "TSMC",
      quantity: 1,
      marketValue: 100,
      cashBalance: null,
      currency: "USD",
      averageCost: null,
      costBasis: null,
      custodyStatus: "free",
      asOfDate: "2026-09-23",
      now,
    });

    for (const target of [
      { assetType: "manual_asset", assetId: "manual:missing" },
      {
        assetType: "investment_position",
        assetId: "manual-investment-position:missing",
      },
      { assetType: "bank_account", assetId: "bank:missing" },
      { assetType: "other", assetId: "unvalidated:other" },
    ])
      await expect(
        addCollateralRelationship(harness.binding, {
          liabilityAccountId: "manual-liability:colon-targets",
          ...target,
          currency: "TWD",
        }),
      ).resolves.toBe(false);
    expect(await listCollateralRelationships(harness.binding)).toHaveLength(0);

    await expect(
      addCollateralRelationship(harness.binding, {
        liabilityAccountId: "manual-liability:colon-targets",
        assetType: "manual_asset",
        assetId: "manual:1234-5678",
        currency: "TWD",
      }),
    ).resolves.toBe(true);
    await expect(
      addCollateralRelationship(harness.binding, {
        liabilityAccountId: "manual-liability:colon-targets",
        assetType: "investment_position",
        assetId: "manual-investment-position:abcd-efgh",
        currency: "TWD",
      }),
    ).resolves.toBe(true);
    expect(await listCollateralRelationships(harness.binding)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetType: "manual_asset",
          assetId: "manual:1234-5678",
        }),
        expect.objectContaining({
          assetType: "investment_position",
          assetId: "manual-investment-position:abcd-efgh",
        }),
      ]),
    );
    expect(await deleteManualAsset(harness.binding, "manual:1234-5678")).toBe(
      false,
    );
    expect(
      await deleteManualInvestmentPosition(
        harness.binding,
        "manual-investment-position:abcd-efgh",
      ),
    ).toBe(false);

    for (const relation of await listCollateralRelationships(harness.binding))
      await deleteCollateralRelationship(harness.binding, relation.id);
    expect(await deleteManualAsset(harness.binding, "manual:1234-5678")).toBe(
      true,
    );
    expect(
      await deleteManualInvestmentPosition(
        harness.binding,
        "manual-investment-position:abcd-efgh",
      ),
    ).toBe(true);
  });
});
