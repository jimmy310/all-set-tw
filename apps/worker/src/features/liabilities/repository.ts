import {
  createDrizzle,
  liabilityAccounts,
  liabilityBalanceSnapshots,
  collateralRelationships,
} from "@taiwan-fin-hub/db";
import { asc, eq, sql } from "drizzle-orm";

export function listCollateralRelationships(db: D1Database) {
  return createDrizzle(db)
    .select({
      id: collateralRelationships.id,
      liabilityAccountId: collateralRelationships.liabilityAccountId,
      assetType: collateralRelationships.assetType,
      assetId: collateralRelationships.assetId,
      collateralValue: collateralRelationships.collateralValue,
      currency: collateralRelationships.currency,
    })
    .from(collateralRelationships)
    .orderBy(
      asc(collateralRelationships.liabilityAccountId),
      asc(collateralRelationships.assetType),
      asc(collateralRelationships.assetId),
    )
    .all();
}

export async function createCollateralRelationship(
  db: D1Database,
  input: {
    id: string;
    liabilityAccountId: string;
    assetType: string;
    assetId: string;
    collateralValue: number | null;
    currency: string;
    now: string;
  },
) {
  await createDrizzle(db)
    .insert(collateralRelationships)
    .values({
      ...input,
      createdAt: input.now,
      updatedAt: input.now,
    });
}

export async function collateralTargetExists(
  db: D1Database,
  assetType: string,
  assetId: string,
) {
  const tableByType: Record<string, string> = {
    investment_position: "investment_positions",
    manual_asset: "manual_assets",
    bank_account: "bank_accounts",
  };
  const table = tableByType[assetType];
  if (!table) return false;
  const row = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(assetId)
    .first<{ id: string }>();
  return row !== null;
}

export async function deleteCollateralRelationship(db: D1Database, id: string) {
  await createDrizzle(db)
    .delete(collateralRelationships)
    .where(eq(collateralRelationships.id, id));
}

export async function listLiabilities(db: D1Database) {
  return createDrizzle(db)
    .select({
      id: liabilityAccounts.id,
      liabilityType: liabilityAccounts.liabilityType,
      provider: liabilityAccounts.provider,
      name: liabilityAccounts.name,
      maskedIdentity: liabilityAccounts.maskedIdentity,
      currency: liabilityAccounts.currency,
      originalPrincipal: liabilityAccounts.originalPrincipal,
      interestRate: liabilityAccounts.interestRate,
      interestRateType: liabilityAccounts.interestRateType,
      startDate: liabilityAccounts.startDate,
      maturityDate: liabilityAccounts.maturityDate,
      monthlyPayment: liabilityAccounts.monthlyPayment,
      nextPaymentDate: liabilityAccounts.nextPaymentDate,
      outstandingPrincipal: liabilityBalanceSnapshots.outstandingPrincipal,
      accruedInterest: liabilityBalanceSnapshots.accruedInterest,
      asOfAt: liabilityBalanceSnapshots.asOfAt,
    })
    .from(liabilityAccounts)
    .leftJoin(
      liabilityBalanceSnapshots,
      eq(
        liabilityBalanceSnapshots.id,
        sql`(SELECT s.id FROM liability_balance_snapshots s WHERE s.liability_account_id = ${liabilityAccounts.id} ORDER BY s.as_of_at DESC, s.id DESC LIMIT 1)`,
      ),
    )
    .orderBy(asc(liabilityAccounts.createdAt), asc(liabilityAccounts.id))
    .all();
}

export async function createLiability(
  db: D1Database,
  input: {
    id: string;
    liabilityType: string;
    provider: string | null;
    name: string;
    maskedIdentity: string | null;
    currency: string;
    originalPrincipal: number | null;
    interestRate: number | null;
    interestRateType: string | null;
    startDate: string | null;
    maturityDate: string | null;
    monthlyPayment: number | null;
    nextPaymentDate: string | null;
    outstandingPrincipal: number | null;
    accruedInterest: number | null;
    asOfAt: string;
    now: string;
  },
) {
  const database = createDrizzle(db);
  await database.batch([
    database.insert(liabilityAccounts).values({
      id: input.id,
      sourceType: "manual",
      liabilityType: input.liabilityType,
      provider: input.provider,
      name: input.name,
      maskedIdentity: input.maskedIdentity,
      currency: input.currency,
      originalPrincipal: input.originalPrincipal,
      interestRate: input.interestRate,
      interestRateType: input.interestRateType,
      startDate: input.startDate,
      maturityDate: input.maturityDate,
      monthlyPayment: input.monthlyPayment,
      nextPaymentDate: input.nextPaymentDate,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(liabilityBalanceSnapshots).values({
      id: `${input.id}:${input.asOfAt}`,
      liabilityAccountId: input.id,
      outstandingPrincipal: input.outstandingPrincipal,
      accruedInterest: input.accruedInterest,
      asOfAt: input.asOfAt,
      source: "manual",
      createdAt: input.now,
    }),
  ]);
}

export async function updateLiability(
  db: D1Database,
  id: string,
  input: Partial<{
    liabilityType: string;
    provider: string | null;
    name: string;
    maskedIdentity: string | null;
    currency: string;
    originalPrincipal: number | null;
    interestRate: number | null;
    interestRateType: string | null;
    startDate: string | null;
    maturityDate: string | null;
    monthlyPayment: number | null;
    nextPaymentDate: string | null;
  }> & {
    outstandingPrincipal?: number | null;
    accruedInterest?: number | null;
    asOfAt?: string;
  },
  now: string,
) {
  const database = createDrizzle(db);
  const { outstandingPrincipal, accruedInterest, asOfAt, ...fields } = input;
  const update = database
    .update(liabilityAccounts)
    .set({ ...fields, updatedAt: now })
    .where(eq(liabilityAccounts.id, id));
  if (asOfAt) {
    await database.batch([
      update,
      database
        .insert(liabilityBalanceSnapshots)
        .values({
          id: `${id}:${asOfAt}`,
          liabilityAccountId: id,
          outstandingPrincipal: outstandingPrincipal ?? null,
          accruedInterest: accruedInterest ?? null,
          asOfAt,
          source: "manual",
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [
            liabilityBalanceSnapshots.liabilityAccountId,
            liabilityBalanceSnapshots.asOfAt,
          ],
          set: {
            outstandingPrincipal: outstandingPrincipal ?? null,
            accruedInterest: accruedInterest ?? null,
          },
        }),
    ]);
  } else if (Object.keys(fields).length > 0) {
    await update;
  }
}

export function deleteLiability(db: D1Database, id: string) {
  return createDrizzle(db)
    .delete(liabilityAccounts)
    .where(eq(liabilityAccounts.id, id));
}
