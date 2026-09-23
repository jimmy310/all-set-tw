import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppBindings } from "../../platform/env";
import { honoFactory } from "../../platform/hono";
import {
  encodePageCursor,
  parseKeysetPagination,
  setKeysetPaginationHeaders,
} from "../../platform/http";
import {
  monthRangeQuerySchema,
  resolveMonthDateRange,
} from "../../platform/month-range";
import { validationHook } from "../../platform/validation";
import {
  getInvestmentPage,
  getInvestmentTransactionPage,
  getInvestmentTransactionsRange,
  addManualInvestmentAccount,
  addManualInvestmentPosition,
  getInvestmentAccounts,
  editManualInvestmentAccount,
  removeManualInvestmentAccount,
  editManualInvestmentPosition,
  removeManualInvestmentPosition,
  linkPositionReconciliation,
  unlinkPositionReconciliation,
} from "./service";

const investmentPageCursorSchema = z.object({
  asOfDate: z.string(),
  assetType: z.string(),
  name: z.string(),
  id: z.string(),
});

const transactionPageCursorSchema = z.object({
  effectiveDate: z.string(),
  updatedAt: z.string(),
  id: z.string(),
});
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountSchema = z.object({
  provider: z.string().trim().min(1).max(120),
  accountType: z.enum([
    "brokerage",
    "sub_brokerage",
    "securities_finance",
    "other",
  ]),
  displayName: z.string().trim().min(1).max(120),
  maskedIdentity: z.string().trim().max(32).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  market: z.string().trim().max(8).nullable().optional(),
});
export const manualPositionSchema = z
  .object({
    accountId: z.string().min(1),
    assetType: z.enum([
      "stock",
      "etf",
      "fund",
      "bond",
      "option",
      "cash",
      "future",
      "crypto",
      "other",
    ]),
    symbol: z.string().trim().max(40).nullable().optional(),
    name: z.string().trim().min(1).max(120),
    quantity: z.number().finite().nullable().optional(),
    marketValue: z.number().int().nullable().optional(),
    cashBalance: z.number().finite().nonnegative().nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    averageCost: z.number().finite().nonnegative().nullable().optional(),
    costBasis: z.number().int().nonnegative().nullable().optional(),
    custodyStatus: z
      .enum(["free", "collateral", "margin", "restricted"])
      .default("free"),
    asOfDate: dateSchema,
    underlyingSymbol: z.string().trim().max(40).nullable().optional(),
    expirationDate: dateSchema.nullable().optional(),
    strikePrice: z.number().finite().nonnegative().nullable().optional(),
    optionRight: z.enum(["call", "put"]).nullable().optional(),
    contractMultiplier: z.number().finite().positive().default(100),
    contractSymbol: z.string().trim().max(120).nullable().optional(),
    optionMarkPrice: z.number().finite().nonnegative().nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (
      body.assetType !== "cash" &&
      body.marketValue == null &&
      body.quantity == null &&
      body.optionMarkPrice == null
    )
      ctx.addIssue({
        code: "custom",
        message: "Provide a quantity or valuation.",
      });
    if (
      body.assetType !== "option" &&
      ((body.quantity ?? 0) < 0 || (body.marketValue ?? 0) < 0)
    )
      ctx.addIssue({
        code: "custom",
        message: "Only options may use signed quantity or market value.",
      });
    if (
      body.assetType === "option" &&
      (body.underlyingSymbol == null ||
        body.expirationDate == null ||
        body.strikePrice == null ||
        body.optionRight == null)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Options require underlying, expiration, strike, and call/put right.",
      });
  });

export const investmentRoutes = honoFactory.createApp();
registerInvestmentRoutes(investmentRoutes);

function registerInvestmentRoutes(api: Hono<AppBindings>) {
  api.get("/investment-accounts", async (c) =>
    c.json(await getInvestmentAccounts(c.env.DB)),
  );

  api.post(
    "/investment-accounts",
    zValidator(
      "json",
      accountSchema,
      validationHook("INVALID_REQUEST", "Investment account is invalid."),
    ),
    async (c) =>
      c.json({
        id: await addManualInvestmentAccount(c.env.DB, c.req.valid("json")),
      }),
  );
  api.put(
    "/investment-accounts/:id",
    zValidator(
      "json",
      accountSchema,
      validationHook("INVALID_REQUEST", "Investment account is invalid."),
    ),
    async (c) => {
      const updated = await editManualInvestmentAccount(
        c.env.DB,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!updated)
        return c.json(
          { success: false, error: { code: "ACCOUNT_NOT_FOUND" } },
          404,
        );
      return c.json({ success: true });
    },
  );
  api.delete("/investment-accounts/:id", async (c) => {
    const deleted = await removeManualInvestmentAccount(
      c.env.DB,
      c.req.param("id"),
    );
    if (!deleted)
      return c.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_HAS_POSITIONS",
            message:
              "Remove or reassign all positions before deleting this account.",
          },
        },
        409,
      );
    return c.json({ success: true });
  });

  api.post(
    "/investments/manual",
    zValidator(
      "json",
      manualPositionSchema,
      validationHook("INVALID_REQUEST", "Investment position is invalid."),
    ),
    async (c) => {
      const id = await addManualInvestmentPosition(
        c.env.DB,
        c.req.valid("json"),
      );
      if (!id)
        return c.json(
          { success: false, error: { code: "MANUAL_ACCOUNT_NOT_FOUND" } },
          404,
        );
      return c.json({ id });
    },
  );
  api.put(
    "/investments/manual/:id",
    zValidator(
      "json",
      manualPositionSchema,
      validationHook("INVALID_REQUEST", "Investment position is invalid."),
    ),
    async (c) => {
      const updated = await editManualInvestmentPosition(
        c.env.DB,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!updated)
        return c.json(
          {
            success: false,
            error: { code: "MANUAL_POSITION_OR_ACCOUNT_NOT_FOUND" },
          },
          404,
        );
      return c.json({ success: true });
    },
  );
  api.delete("/investments/manual/:id", async (c) => {
    const deleted = await removeManualInvestmentPosition(
      c.env.DB,
      c.req.param("id"),
    );
    if (!deleted)
      return c.json(
        {
          success: false,
          error: {
            code: "POSITION_IS_COLLATERAL",
            message:
              "Remove the collateral link before deleting this position.",
          },
        },
        409,
      );
    return c.json({ success: true });
  });
  api.put(
    "/investments/:id/reconciliation",
    zValidator(
      "json",
      z.object({
        economicSecurityId: z.string().trim().min(1).max(160),
        observationCoverage: z.enum(["complete", "subset"]),
      }),
      validationHook("INVALID_REQUEST", "Position reconciliation is invalid."),
    ),
    async (c) => {
      const updated = await linkPositionReconciliation(
        c.env.DB,
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!updated)
        return c.json(
          { success: false, error: { code: "MANUAL_POSITION_NOT_FOUND" } },
          404,
        );
      return c.json({ success: true });
    },
  );
  api.delete("/investments/:id/reconciliation", async (c) => {
    const removed = await unlinkPositionReconciliation(
      c.env.DB,
      c.req.param("id"),
    );
    if (!removed)
      return c.json(
        {
          success: false,
          error: { code: "RECONCILIATION_OVERRIDE_NOT_FOUND" },
        },
        404,
      );
    return c.json({ success: true });
  });

  api.get("/investments", async (c) => {
    const { limit, cursor } = parseKeysetPagination(
      c.req.query(),
      investmentPageCursorSchema,
      100,
    );
    const page = await getInvestmentPage(c.env.DB, limit, cursor);
    setKeysetPaginationHeaders((name, value) => c.header(name, value), {
      hasMore: page.hasMore,
      nextCursor:
        page.hasMore && page.last
          ? encodePageCursor({
              asOfDate: page.last.asOfDate,
              assetType: page.last.assetType,
              name: page.last.name,
              id: page.last.id,
            })
          : undefined,
    });
    return c.json(page.positions);
  });

  api.get(
    "/investment-transactions",
    zValidator(
      "query",
      monthRangeQuerySchema,
      validationHook("INVALID_REQUEST", "Invalid month range."),
    ),
    async (c) => {
      const range = resolveMonthDateRange(c.req.valid("query"));
      if (range)
        return c.json(await getInvestmentTransactionsRange(c.env.DB, range));

      const { limit, cursor } = parseKeysetPagination(
        c.req.query(),
        transactionPageCursorSchema,
        100,
      );
      const page = await getInvestmentTransactionPage(c.env.DB, limit, cursor);
      setKeysetPaginationHeaders((name, value) => c.header(name, value), {
        hasMore: page.hasMore,
        nextCursor:
          page.hasMore && page.last
            ? encodePageCursor({
                effectiveDate: page.last.effectiveDate,
                updatedAt: page.last.updatedAt,
                id: page.last.id,
              })
            : undefined,
      });
      return c.json(page.transactions);
    },
  );
}
