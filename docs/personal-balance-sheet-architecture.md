# Personal Balance Sheet Foundation

## Current design

The existing bank snapshots, investment positions and transactions, manual assets,
exchange rates, and net-worth history remain authoritative for their existing
features. The additive schema introduces first-class investment accounts,
liability accounts with dated balance observations, and explicit collateral
relationships. Existing TDCC positions are preserved unchanged and are not
assigned to guessed brokerage accounts.

Manual assets continue to hold gross asset value (so real estate can retain its
estimated market value). A mortgage or other debt is recorded separately as a
liability. Collateral is a relationship and does not subtract from ownership or
become a liability.

## Accounting rules

- Net worth is gross assets less known liabilities.
- Unknown balances and missing FX rates are unknown, never zero.
- Position custody status describes restriction only; collateral remains an asset.
- A borrowing increases cash and liability equally and leaves net worth unchanged.
- Source observations require explicit economic identity and coverage metadata
  before they can be safely consolidated. The foundation does not infer that two
  providers describe distinct or overlapping holdings.
- Existing `net_worth_history` remains historical source data; this release does
  not reconstruct liability history from current balances.

## Migration and acceptance

Migration `0048_personal_balance_sheet.sql` is additive. It does not rewrite or
delete investment positions, investment transactions, manual assets, bank data,
or historical snapshots. Existing position identity remains `(connector_id,
source_id, as_of_date)`. New manual and connector liability records use separate
account metadata and dated snapshots; a NULL outstanding principal means the
balance is unavailable.

Deterministic tests cover balance-sheet arithmetic, borrowing neutrality,
free-to-collateral invariance, explicit overlap handling, currency conversion,
unknown valuation handling, liability round trips, and migration preservation.
