/**
 * Validation of a transaction before it is saved. Returns a list of problem
 * codes (empty when valid) so the UI can show a translated message.
 */
import { isValidDay } from './dates';
import { isMinor } from './money';
import type { Account, Transaction } from './types';

export type TxProblem =
  | 'amount_invalid'
  | 'amount_zero'
  | 'amount_negative'
  | 'day_invalid'
  | 'account_missing'
  | 'destination_missing'
  | 'destination_same'
  | 'destination_not_card'
  | 'source_is_card'
  | 'destination_unexpected';

export type TxDraft = Pick<Transaction, 'type' | 'amount' | 'day' | 'accountId' | 'toAccountId'>;

export function validateTransaction(
  draft: TxDraft,
  accounts: ReadonlyMap<string, Pick<Account, 'type'>>,
): TxProblem[] {
  const problems: TxProblem[] = [];
  if (!isMinor(draft.amount)) problems.push('amount_invalid');
  else if (draft.amount === 0) problems.push('amount_zero');
  else if (draft.amount < 0 && draft.type !== 'adjustment') problems.push('amount_negative');
  if (!isValidDay(draft.day)) problems.push('day_invalid');

  const from = accounts.get(draft.accountId);
  if (!from) problems.push('account_missing');

  const needsDestination = draft.type === 'transfer' || draft.type === 'card_payment';
  if (needsDestination) {
    const to = draft.toAccountId === null ? undefined : accounts.get(draft.toAccountId);
    if (!to) problems.push('destination_missing');
    else if (draft.toAccountId === draft.accountId) problems.push('destination_same');
    else if (draft.type === 'card_payment') {
      if (to.type !== 'credit_card') problems.push('destination_not_card');
      if (from?.type === 'credit_card') problems.push('source_is_card');
    }
  } else if (draft.toAccountId !== null) {
    problems.push('destination_unexpected');
  }
  return problems;
}

/**
 * A transfer whose destination is a credit card is really a bill payment.
 * Normalising it keeps "never counted as spending" true however it was entered.
 */
export function normalizeType(
  draft: TxDraft,
  accounts: ReadonlyMap<string, Pick<Account, 'type'>>,
): TxDraft['type'] {
  if (draft.type === 'transfer' && draft.toAccountId !== null) {
    const to = accounts.get(draft.toAccountId);
    const from = accounts.get(draft.accountId);
    if (to?.type === 'credit_card' && from && from.type !== 'credit_card') return 'card_payment';
  }
  return draft.type;
}
