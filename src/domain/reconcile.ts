/**
 * Reconciliation (brief §3.6): compare the balance the bank or card shows
 * with the balance the app computed, and optionally book the difference.
 */
import { outstandingFromBalance } from './balances';
import type { Day } from './dates';
import type { Minor } from './money';
import type { Account, AccountType } from './types';

export const UNMATCHED_LABEL = 'Unmatched';

export interface Reconciliation {
  /** The real balance as a signed asset value. */
  statedBalance: Minor;
  computedBalance: Minor;
  /** statedBalance - computedBalance: the adjustment that would make them agree. */
  difference: Minor;
  matched: boolean;
  /**
   * 'missing_spend': the app thinks you have more than you do (or owe less),
   * so expenses are probably missing. 'missing_income' is the opposite.
   */
  direction: 'matched' | 'missing_spend' | 'missing_income';
}

/**
 * Converts the figure the user reads off their bank app or statement into a
 * signed asset balance. For a credit card the user types the amount owed.
 */
export function statedToBalance(type: AccountType, entered: Minor): Minor {
  return type === 'credit_card' ? outstandingFromBalance(entered) : entered;
}

/** The figure to show the user for an account: outstanding for cards. */
export function balanceToDisplay(type: AccountType, balance: Minor): Minor {
  return type === 'credit_card' ? outstandingFromBalance(balance) : balance;
}

export function reconcile(
  account: Pick<Account, 'type'>,
  computedBalance: Minor,
  entered: Minor,
): Reconciliation {
  const statedBalance = statedToBalance(account.type, entered);
  const difference = statedBalance - computedBalance;
  return {
    statedBalance,
    computedBalance,
    difference,
    matched: difference === 0,
    direction: difference === 0 ? 'matched' : difference < 0 ? 'missing_spend' : 'missing_income',
  };
}

export interface AdjustmentDraft {
  type: 'adjustment';
  amount: Minor;
  accountId: string;
  categoryId: string | null;
  payee: string;
  day: Day;
}

/**
 * The adjustment entry that closes the gap. It only counts towards spending
 * if the user files it under a spending category.
 */
export function adjustmentFor(
  accountId: string,
  result: Reconciliation,
  day: Day,
  categoryId: string | null,
): AdjustmentDraft | null {
  if (result.matched) return null;
  return {
    type: 'adjustment',
    amount: result.difference,
    accountId,
    categoryId,
    payee: UNMATCHED_LABEL,
    day,
  };
}
