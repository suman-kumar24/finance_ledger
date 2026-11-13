/**
 * "Coming up": card bills, recurring items and scheduled entries that fall
 * due soon (brief §5.2). Overdue items stay on the list until dealt with.
 */
import type { CardStatus } from './cards';
import { addDays, type Day } from './dates';
import type { Minor } from './money';
import { occurrencesUntil } from './recurring';
import type { Account, RecurringRule, Transaction } from './types';

export type UpcomingKind = 'card_bill' | 'recurring' | 'scheduled';

export interface UpcomingItem {
  /** Stable key for lists. */
  key: string;
  kind: UpcomingKind;
  day: Day;
  title: string;
  amount: Minor;
  /** Id of the card, rule or transaction. */
  refId: string;
  overdue: boolean;
  /** For recurring items: whether the entry is created automatically. */
  auto?: boolean;
  /** Money coming in rather than going out. */
  incoming?: boolean;
}

export const UPCOMING_DAYS = 14;

export interface UpcomingInput {
  today: Day;
  cards: { account: Pick<Account, 'id' | 'name'>; status: CardStatus }[];
  rules: RecurringRule[];
  scheduled: Pick<Transaction, 'id' | 'day' | 'amount' | 'payee' | 'type'>[];
  /** Fallback title for a scheduled entry without a payee. */
  scheduledTitle: string;
  days?: number;
}

export function upcoming(input: UpcomingInput): UpcomingItem[] {
  const horizon = addDays(input.today, input.days ?? UPCOMING_DAYS);
  const items: UpcomingItem[] = [];

  for (const { account, status } of input.cards) {
    if (status.currentBill <= 0 || status.dueDate === null || status.dueDate > horizon) continue;
    items.push({
      key: `bill-${account.id}-${status.dueDate}`,
      kind: 'card_bill',
      day: status.dueDate,
      title: account.name,
      amount: status.currentBill,
      refId: account.id,
      overdue: status.dueDate < input.today,
    });
  }

  for (const rule of input.rules) {
    if (!rule.active) continue;
    for (const day of occurrencesUntil(rule, horizon, 20)) {
      items.push({
        key: `rule-${rule.id}-${day}`,
        kind: 'recurring',
        day,
        title: rule.name,
        amount: rule.amount,
        refId: rule.id,
        overdue: day < input.today,
        auto: rule.mode === 'auto',
        incoming: rule.type === 'income',
      });
    }
  }

  for (const tx of input.scheduled) {
    if (tx.day > horizon) continue;
    items.push({
      key: `tx-${tx.id}`,
      kind: 'scheduled',
      day: tx.day,
      title: tx.payee ?? input.scheduledTitle,
      amount: Math.abs(tx.amount),
      refId: tx.id,
      overdue: tx.day < input.today,
      incoming: tx.type === 'income' || tx.type === 'refund',
    });
  }

  return items.sort((a, b) => a.day.localeCompare(b.day) || a.key.localeCompare(b.key));
}
