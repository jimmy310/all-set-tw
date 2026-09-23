import {
  createLiability,
  deleteLiability,
  listLiabilities,
  updateLiability,
} from "./repository";

export function getLiabilities(db: D1Database) {
  return listLiabilities(db);
}

export async function addLiability(
  db: D1Database,
  input: {
    liabilityType: string;
    provider?: string | null;
    name: string;
    maskedIdentity?: string | null;
    currency: string;
    originalPrincipal?: number | null;
    interestRate?: number | null;
    interestRateType?: string | null;
    startDate?: string | null;
    maturityDate?: string | null;
    monthlyPayment?: number | null;
    nextPaymentDate?: string | null;
    outstandingPrincipal?: number | null;
    accruedInterest?: number | null;
    asOfDate: string;
  },
) {
  const id = `manual-liability:${crypto.randomUUID()}`;
  await createLiability(db, {
    ...input,
    provider: input.provider ?? null,
    maskedIdentity: input.maskedIdentity ?? null,
    originalPrincipal: input.originalPrincipal ?? null,
    interestRate: input.interestRate ?? null,
    interestRateType: input.interestRateType ?? null,
    startDate: input.startDate ?? null,
    maturityDate: input.maturityDate ?? null,
    monthlyPayment: input.monthlyPayment ?? null,
    nextPaymentDate: input.nextPaymentDate ?? null,
    outstandingPrincipal: input.outstandingPrincipal ?? null,
    accruedInterest: input.accruedInterest ?? null,
    asOfAt: `${input.asOfDate}T23:59:59.999Z`,
    now: new Date().toISOString(),
    id,
  });
  return id;
}

export function editLiability(
  db: D1Database,
  id: string,
  input: {
    liabilityType?: string;
    provider?: string | null;
    name?: string;
    maskedIdentity?: string | null;
    currency?: string;
    originalPrincipal?: number | null;
    interestRate?: number | null;
    interestRateType?: string | null;
    startDate?: string | null;
    maturityDate?: string | null;
    monthlyPayment?: number | null;
    nextPaymentDate?: string | null;
    outstandingPrincipal?: number | null;
    accruedInterest?: number | null;
    asOfDate?: string;
  },
) {
  const { asOfDate, ...fields } = input;
  return updateLiability(
    db,
    id,
    { ...fields, asOfAt: asOfDate ? `${asOfDate}T23:59:59.999Z` : undefined },
    new Date().toISOString(),
  );
}

export function removeLiability(db: D1Database, id: string) {
  return deleteLiability(db, id);
}
