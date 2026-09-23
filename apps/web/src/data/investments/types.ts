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
  quantity?: number;
  marketValue?: number;
  cashBalance?: number;
  currency: string;
  asOfDate: string;
  investmentAccountId?: string | null;
  custodyStatus?: "free" | "collateral" | "margin" | "restricted";
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
  assetType?: "stock" | "etf" | "fund" | "bond" | "unknown";
  tradeDate?: string;
  postedDate?: string;
  transactionCode?: string;
  transactionName?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  currency: string;
}
