import type { ConnectorId } from "@taiwan-fin-hub/core";

export interface InvestmentRow {
  id: string;
  assetType:
    | "stock"
    | "etf"
    | "fund"
    | "bond"
    | "option"
    | "cash"
    | "future"
    | "crypto"
    | "other";
  symbol?: string;
  name: string;
  quantity?: number | null;
  marketValue?: number | null;
  cashBalance?: number | null;
  currency: string;
  asOfDate: string;
  investmentAccountId?: string | null;
  custodyStatus?: "free" | "collateral" | "margin" | "restricted";
  connectorId?: string;
  sourceId?: string;
  hasReconciliationOverride?: boolean;
  sourceEconomicSecurityId?: string | null;
  sourceObservationCoverage?: "complete" | "subset";
  averageCost?: number | null;
  costBasis?: number | null;
  underlyingSymbol?: string | null;
  expirationDate?: string | null;
  strikePrice?: number | null;
  optionRight?: "call" | "put" | null;
  contractMultiplier?: number;
  contractSymbol?: string | null;
  optionMarkPrice?: number | null;
  economicSecurityId?: string | null;
  observationCoverage?: "complete" | "subset";
}

export interface InvestmentAccountRow {
  id: string;
  provider: string;
  accountType: string;
  displayName: string;
  maskedIdentity: string | null;
  currency: string;
  market: string | null;
}

export interface InvestmentTransactionRow {
  id: string;
  connectorId: ConnectorId;
  accountId: string;
  sourceId: string;
  brokerNo?: string;
  brokerAccount?: string;
  brokerName?: string;
  symbol?: string;
  name?: string;
  assetType?:
    | "stock"
    | "etf"
    | "fund"
    | "bond"
    | "option"
    | "cash"
    | "future"
    | "crypto"
    | "other"
    | "unknown";
  tradeDate?: string;
  postedDate?: string;
  transactionCode?: string;
  transactionName?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  currency: string;
  underlyingSymbol?: string;
  expirationDate?: string;
  strikePrice?: number;
  optionRight?: "call" | "put";
  contractSymbol?: string;
  externalContractId?: string;
}
