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
const manualPositionSchema = z
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
    quantity: z.number().finite().nonnegative().nullable().optional(),
    marketValue: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    averageCost: z.number().finite().nonnegative().nullable().optional(),
    costBasis: z.number().int().nonnegative().nullable().optional(),
    custodyStatus: z
      .enum(["free", "collateral", "margin", "restricted"])
      .default("free"),
    asOfDate: dateSchema,
  })
  .refine(
    (body) => body.marketValue !== undefined || body.quantity !== undefined,
    "Provide a quantity or valuation.",
  );

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

  api.post(
    "/investments/manual",
    zValidator(
      "json",
      manualPositionSchema,
      validationHook("INVALID_REQUEST", "Investment position is invalid."),
    ),
    async (c) =>
      c.json({
        id: await addManualInvestmentPosition(c.env.DB, c.req.valid("json")),
      }),
  );

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
