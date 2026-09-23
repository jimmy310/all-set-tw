import type { ExchangeRateRow, ManualAssetRow } from "@/data/assets/types";
import type { BankAccountRow, BankData } from "@/data/bank/types";
import type { InvestmentRow } from "@/data/investments/types";
import { missingExchangeRateCurrencies } from "@/shared/format/financial";
import {
  calculateInvestmentPortfolioSummary,
  calculatePersonalBalanceSheet,
  investmentPositionValue,
} from "./balance-sheet";

const CONNECTOR_BANK_CODES: Record<string, string> = {
  firstbank: "007",
  hncb: "008",
  cathaybk: "013",
  obank: "048",
  skbank: "103",
  sinopac: "807",
  esun: "808",
  taishin: "812",
  ctbc: "822",
};

export interface InstitutionAssetGroup {
  key: string;
  institution: string;
  accounts: BankAccountRow[];
  cards: BankAccountRow[];
  assetTotalTwd: number;
  debtTotalTwd: number;
  hasUnknownCardBalance: boolean;
  hasUnknownAssetBalance: boolean;
  foreignCurrencies: string[];
}

export interface AssetSummary {
  deposits: BankAccountRow[];
  cards: BankAccountRow[];
  bankTotal: number;
  investmentTotal: number;
  investmentGrossAssets: number;
  investmentIncomplete: boolean;
  bankIncomplete: boolean;
  manualIncomplete: boolean;
  manualTotal: number;
  cardDebt: number;
  hasUnknownCardBalance: boolean;
  grossAssets: number | null;
  totalLiabilities: number | null;
  netWorth: number | null;
  institutionGroups: InstitutionAssetGroup[];
  missingCurrencies: string[];
}

function institutionKey(account: BankAccountRow) {
  const bankCode =
    account.bankCode ?? CONNECTOR_BANK_CODES[account.connectorId];
  return bankCode ? `bank:${bankCode}` : `connector:${account.connectorId}`;
}

export function calculateAssetSummary({
  bank,
  investments,
  manualAssets,
  liabilities = [],
  rates,
}: {
  bank: BankData;
  investments: InvestmentRow[];
  manualAssets: ManualAssetRow[];
  liabilities?: Array<{
    liabilityType?: string;
    outstandingPrincipal: number | null;
    accruedInterest?: number | null;
    currency: string;
  }>;
  rates?: ExchangeRateRow[];
}): AssetSummary {
  const rateValues = Object.fromEntries(
    (rates ?? []).map((rate) => [rate.currency, rate.rateTwd]),
  );
  const portfolio = calculateInvestmentPortfolioSummary(
    investments,
    rateValues,
  );
  const toTwd = (value: number, currency: string) =>
    currency === "TWD" ? value : value * (rateValues[currency] ?? 0);
  const deposits = bank.accounts.filter(
    (account) => account.accountType !== "credit",
  );
  const cards = bank.accounts.filter(
    (account) => account.accountType === "credit",
  );
  const missingCurrencies = missingExchangeRateCurrencies(
    [
      ...deposits.map((account) => ({
        currency: account.currency,
        amount: account.balance ?? 0,
      })),
      ...cards.map((account) => ({
        currency: account.currency,
        amount: Math.abs(account.balance ?? 0),
      })),
      ...portfolio.positions.map((item) => ({
        currency: item.currency,
        amount: investmentPositionValue(item) ?? 0,
      })),
      ...manualAssets.map((item) => ({
        currency: item.currency,
        amount: item.value ?? 0,
      })),
      ...liabilities.map((item) => ({
        currency: item.currency,
        amount:
          item.outstandingPrincipal == null
            ? 0
            : item.outstandingPrincipal + (item.accruedInterest ?? 0),
      })),
    ],
    rateValues,
  );
  const bankTotal = deposits.reduce(
    (sum, account) => sum + toTwd(account.balance ?? 0, account.currency),
    0,
  );
  const investmentTotal = portfolio.netValueTwd ?? 0;
  const investmentGrossAssets = portfolio.grossAssetsTwd ?? 0;
  const manualTotal = manualAssets.reduce(
    (sum, item) => sum + toTwd(item.value ?? 0, item.currency),
    0,
  );
  const cardDebt = cards.reduce(
    (sum, account) =>
      sum + Math.abs(toTwd(account.balance ?? 0, account.currency)),
    0,
  );
  const balanceSheet = calculatePersonalBalanceSheet({
    bankAccounts: bank.accounts,
    investments,
    manualAssets,
    liabilities,
    rates: rateValues,
  });

  const groups = bank.accounts.reduce<Record<string, BankAccountRow[]>>(
    (result, account) => {
      (result[institutionKey(account)] ??= []).push(account);
      return result;
    },
    {},
  );
  const institutionGroups = Object.entries(groups)
    .map(([key, groupedAccounts]) => {
      const accounts = groupedAccounts.filter(
        (account) => account.accountType !== "credit",
      );
      const cards = groupedAccounts.filter(
        (account) => account.accountType === "credit",
      );
      return {
        key,
        institution:
          groupedAccounts.find((account) => account.institutionName)
            ?.institutionName ??
          groupedAccounts[0]?.connectorId ??
          "金融機構",
        accounts: [...accounts].sort(
          (a, b) =>
            toTwd(b.balance ?? 0, b.currency) -
            toTwd(a.balance ?? 0, a.currency),
        ),
        cards: [...cards].sort(
          (a, b) =>
            Math.abs(toTwd(b.balance ?? 0, b.currency)) -
            Math.abs(toTwd(a.balance ?? 0, a.currency)),
        ),
        assetTotalTwd: accounts.reduce(
          (sum, account) => sum + toTwd(account.balance ?? 0, account.currency),
          0,
        ),
        hasUnknownCardBalance: cards.some(
          (card) =>
            card.balance == null ||
            (card.currency !== "TWD" &&
              rateValues[card.currency] == null &&
              card.balance !== 0),
        ),
        hasUnknownAssetBalance: accounts.some(
          (account) =>
            account.balance == null ||
            (account.currency !== "TWD" &&
              rateValues[account.currency] == null &&
              account.balance !== 0),
        ),
        debtTotalTwd: cards.reduce(
          (sum, account) =>
            sum + Math.abs(toTwd(account.balance ?? 0, account.currency)),
          0,
        ),
        foreignCurrencies: [
          ...new Set(
            groupedAccounts
              .map((account) => account.currency)
              .filter((currency) => currency !== "TWD"),
          ),
        ],
      };
    })
    .sort(
      (a, b) =>
        b.assetTotalTwd - a.assetTotalTwd ||
        b.debtTotalTwd - a.debtTotalTwd ||
        a.institution.localeCompare(b.institution, "zh-TW"),
    );

  return {
    deposits,
    cards,
    bankTotal,
    investmentTotal,
    investmentGrossAssets,
    investmentIncomplete: portfolio.incomplete,
    bankIncomplete: bank.accounts.some(
      (item) =>
        item.balance == null ||
        (item.currency !== "TWD" &&
          rateValues[item.currency] == null &&
          item.balance !== 0),
    ),
    manualIncomplete: manualAssets.some(
      (item) =>
        item.value == null ||
        (item.currency !== "TWD" &&
          rateValues[item.currency] == null &&
          item.value !== 0),
    ),
    manualTotal,
    cardDebt,
    hasUnknownCardBalance: cards.some((card) => card.balance == null),
    grossAssets: balanceSheet.grossAssets,
    totalLiabilities: balanceSheet.totalLiabilities,
    netWorth: balanceSheet.netWorth,
    institutionGroups,
    missingCurrencies: [
      ...new Set([
        ...missingCurrencies,
        ...portfolio.missingCurrencies,
        ...balanceSheet.missingCurrencies,
      ]),
    ].sort(),
  };
}
