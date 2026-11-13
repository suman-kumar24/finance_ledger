/**
 * Account balances (brief §3.1, §3.2, §3.4).
 *
 * Every account has one signed balance as an ASSET value: what you have is
 * positive and what you owe is negative. A credit card's outstanding amount
 * is therefore `-balance`.
 *
 *   type           primary account      destination account
 *   expense        - amount
 *   income         + amount
 *   refund         + amount             (card: outstanding goes down)
 *   adjustment     + amount (signed)
 *   transfer       - amount             + amount
 *   card_payment   - amount (bank)      + amount (card: outstanding goes down)
 *
 * A card purchase is an `expense` on the card account: it lowers the card's
 * balance (raises outstanding) and touches no bank account. Paying the bill
 * is a `card_payment`, which moves money and is never spending.
 *
 * Only `cleared` entries count. Entries dated before an account's opening
 * date do not change its balance, because the opening balance already
 * reflects them; they still appear in that month's reports.
 */
import type { Day } from './dates';
import type { Minor } from './money';
import {
  isSavingType,
  isSpendableType,
  type Account,
  type AccountType,
  type LedgerEntry,
  type TransactionType,
} from './types';

type AccountLike = Pick<Account, 'id' | 'type' | 'openingBalance' | 'openingDate' | 'archived'>;

/** Effect of one unit of each type on the primary account's balance. */
const PRIMARY_SIGN: Record<TransactionType, 1 | -1> = {
  expense: -1,
  income: 1,
  refund: 1,
  adjustment: 1,
  transfer: -1,
  card_payment: -1,
};

export function hasDestination(type: TransactionType): boolean {
  return type === 'transfer' || type === 'card_payment';
}

/** Change to the primary account's balance caused by an entry. */
export function primaryDelta(type: TransactionType, amount: Minor): Minor {
  return PRIMARY_SIGN[type] * amount;
}

/** Change to the destination account's balance caused by an entry. */
export function destinationDelta(type: TransactionType, amount: Minor): Minor {
  return hasDestination(type) ? amount : 0;
}

/** Change an entry makes to one account's balance (0 if it is not involved). */
export function balanceDelta(entry: LedgerEntry, accountId: string): Minor {
  if (entry.status !== 'cleared') return 0;
  let delta = 0;
  if (entry.accountId === accountId) delta += primaryDelta(entry.type, entry.amount);
  if (entry.toAccountId === accountId) delta += destinationDelta(entry.type, entry.amount);
  return delta;
}

/**
 * Pre-summed movements, as produced by a SQL GROUP BY. `side` says whether
 * the account was the entry's primary or destination account.
 */
export interface MovementSum {
  accountId: string;
  side: 'primary' | 'destination';
  type: TransactionType;
  total: Minor;
}

/** Balances from opening balances plus grouped sums. */
export function balancesFromSums(
  accounts: readonly AccountLike[],
  sums: readonly MovementSum[],
): Map<string, Minor> {
  const balances = new Map<string, Minor>();
  for (const account of accounts) balances.set(account.id, account.openingBalance);
  for (const row of sums) {
    const current = balances.get(row.accountId);
    if (current === undefined) continue;
    const delta =
      row.side === 'primary'
        ? primaryDelta(row.type, row.total)
        : destinationDelta(row.type, row.total);
    balances.set(row.accountId, current + delta);
  }
  return balances;
}

export interface BalanceOptions {
  /** Include entries up to and including this day. Default: all entries. */
  asOf?: Day;
}

/** Balances computed directly from ledger entries. */
export function computeBalances(
  accounts: readonly AccountLike[],
  entries: readonly LedgerEntry[],
  options: BalanceOptions = {},
): Map<string, Minor> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const balances = new Map<string, Minor>();
  for (const account of accounts) balances.set(account.id, account.openingBalance);
  const counts = (accountId: string | null, day: Day): accountId is string => {
    if (accountId === null) return false;
    const account = byId.get(accountId);
    return account !== undefined && day >= account.openingDate;
  };
  for (const entry of entries) {
    if (entry.status !== 'cleared') continue;
    if (options.asOf !== undefined && entry.day > options.asOf) continue;
    if (counts(entry.accountId, entry.day)) {
      balances.set(
        entry.accountId,
        (balances.get(entry.accountId) ?? 0) + primaryDelta(entry.type, entry.amount),
      );
    }
    if (hasDestination(entry.type) && counts(entry.toAccountId, entry.day)) {
      balances.set(
        entry.toAccountId,
        (balances.get(entry.toAccountId) ?? 0) + destinationDelta(entry.type, entry.amount),
      );
    }
  }
  return balances;
}

/** Balance of a single account. */
export function accountBalance(
  account: AccountLike,
  entries: readonly LedgerEntry[],
  options: BalanceOptions = {},
): Minor {
  return computeBalances([account], entries, options).get(account.id) ?? account.openingBalance;
}

/** A credit card's outstanding amount (positive when you owe money). */
export function outstandingFromBalance(balance: Minor): Minor {
  return balance === 0 ? 0 : -balance;
}

export interface NetWorth {
  /** Sum of non-card balances. */
  assets: Minor;
  /** Sum of card outstanding amounts (positive = owed). */
  cardOutstanding: Minor;
  /** assets - cardOutstanding */
  netWorth: Minor;
  /** Money in bank, cash and wallet accounts. */
  availableToSpend: Minor;
  /** Money in savings and investment accounts. */
  savedInvested: Minor;
  byType: Record<AccountType, Minor>;
}

/** Totals across non-archived accounts. */
export function netWorth(
  accounts: readonly AccountLike[],
  balances: ReadonlyMap<string, Minor>,
): NetWorth {
  const byType: Record<AccountType, Minor> = {
    bank: 0,
    cash: 0,
    wallet: 0,
    credit_card: 0,
    investment: 0,
    savings: 0,
  };
  let assets = 0;
  let cardOutstanding = 0;
  let availableToSpend = 0;
  let savedInvested = 0;
  for (const account of accounts) {
    if (account.archived) continue;
    const balance = balances.get(account.id) ?? account.openingBalance;
    byType[account.type] += balance;
    if (account.type === 'credit_card') {
      cardOutstanding += outstandingFromBalance(balance);
    } else {
      assets += balance;
      if (isSpendableType(account.type)) availableToSpend += balance;
      if (isSavingType(account.type)) savedInvested += balance;
    }
  }
  return {
    assets,
    cardOutstanding,
    netWorth: assets - cardOutstanding,
    availableToSpend,
    savedInvested,
    byType,
  };
}
