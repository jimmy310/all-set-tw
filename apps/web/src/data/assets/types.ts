export interface NetWorthHistoryRow {
  date: string;
  netWorth: number;
  assetType: string;
  source: string;
}

export interface ExchangeRateRow {
  currency: string;
  rateTwd: number;
  updatedAt: string;
}

export interface ManualAssetRow {
  id: string;
  name: string;
  category: string;
  note: string | null;
  currency: string;
  createdAt: string;
  value?: number;
  date?: string;
}

export interface ManualAssetHistoryEntry {
  date: string;
  value: number;
}

export interface LiabilityRow {
  id: string;
  liabilityType:
    | "mortgage"
    | "personal_loan"
    | "securities_backed_loan"
    | "margin"
    | "credit_card"
    | "auto_loan"
    | "other";
  provider: string | null;
  name: string;
  maskedIdentity: string | null;
  currency: string;
  originalPrincipal: number | null;
  interestRate: number | null;
  interestRateType: "fixed" | "variable" | "unknown" | null;
  startDate: string | null;
  maturityDate: string | null;
  monthlyPayment: number | null;
  nextPaymentDate: string | null;
  outstandingPrincipal: number | null;
  accruedInterest: number | null;
  asOfAt: string | null;
}
