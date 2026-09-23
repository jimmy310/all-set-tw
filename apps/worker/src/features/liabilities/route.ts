import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppBindings } from "../../platform/env";
import { honoFactory } from "../../platform/hono";
import { validationHook } from "../../platform/validation";
import {
  addLiability,
  getLiabilities,
  removeLiability,
  editLiability,
  getCollateralRelationships,
  addCollateralRelationship,
  removeCollateralRelationship,
} from "./service";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableText = z.string().trim().max(120).nullable().optional();
const schema = z.object({
  liabilityType: z.enum([
    "mortgage",
    "personal_loan",
    "securities_backed_loan",
    "margin",
    "credit_card",
    "auto_loan",
    "other",
  ]),
  provider: nullableText,
  name: z.string().trim().min(1).max(120),
  maskedIdentity: z.string().trim().max(32).nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("TWD"),
  originalPrincipal: z.number().int().nonnegative().nullable().optional(),
  interestRate: z.number().finite().nonnegative().nullable().optional(),
  interestRateType: z
    .enum(["fixed", "variable", "unknown"])
    .nullable()
    .optional(),
  startDate: dateSchema.nullable().optional(),
  maturityDate: dateSchema.nullable().optional(),
  monthlyPayment: z.number().int().nonnegative().nullable().optional(),
  nextPaymentDate: dateSchema.nullable().optional(),
  outstandingPrincipal: z.number().int().nonnegative().nullable().optional(),
  accruedInterest: z.number().int().nonnegative().nullable().optional(),
  asOfDate: dateSchema,
});
const updateSchema = schema
  .partial()
  .extend({ asOfDate: dateSchema.optional() })
  .refine((body) => Object.keys(body).length > 0);

export const liabilityRoutes = honoFactory.createApp();
registerLiabilityRoutes(liabilityRoutes);

function registerLiabilityRoutes(api: Hono<AppBindings>) {
  api.get("/liabilities", async (c) => c.json(await getLiabilities(c.env.DB)));
  api.get("/collateral-relationships", async (c) =>
    c.json(await getCollateralRelationships(c.env.DB)),
  );
  api.post(
    "/collateral-relationships",
    zValidator(
      "json",
      z.object({
        liabilityAccountId: z.string().min(1),
        assetType: z.enum([
          "investment_position",
          "manual_asset",
          "bank_account",
          "other",
        ]),
        assetId: z.string().min(1),
        collateralValue: z.number().int().nonnegative().nullable().optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .default("TWD"),
      }),
      validationHook("INVALID_REQUEST", "Collateral relationship is invalid."),
    ),
    async (c) => {
      await addCollateralRelationship(c.env.DB, c.req.valid("json"));
      return c.json({ success: true });
    },
  );
  api.delete("/collateral-relationships/:id", async (c) => {
    await removeCollateralRelationship(c.env.DB, c.req.param("id"));
    return c.json({ success: true });
  });
  api.post(
    "/liabilities",
    zValidator(
      "json",
      schema,
      validationHook("INVALID_REQUEST", "Liability is invalid."),
    ),
    async (c) =>
      c.json({ id: await addLiability(c.env.DB, c.req.valid("json")) }),
  );
  api.put(
    "/liabilities/:id",
    zValidator(
      "json",
      updateSchema,
      validationHook("INVALID_REQUEST", "Liability update is invalid."),
    ),
    async (c) => {
      await editLiability(c.env.DB, c.req.param("id"), c.req.valid("json"));
      return c.json({ success: true });
    },
  );
  api.delete("/liabilities/:id", async (c) => {
    await removeLiability(c.env.DB, c.req.param("id"));
    return c.json({ success: true });
  });
}
