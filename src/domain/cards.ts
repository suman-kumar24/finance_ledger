/**
 * Credit card statement cycles (brief §3.3).
 *
 * A card has a statement day and a due day (days of the month, clamped to
 * the month's length). A cycle runs from the day after one statement date up
 * to and including the next statement date. The due date is the first
 * occurrence of the due day strictly after the statement date.
 *
 *   statement total  outstanding at the end of the statement date (never
 *                    below zero), or the figure the user typed from the
 *                    printed statement
 *   current bill     statement total minus payments made since that date
 *   unbilled         everything else that makes up today's outstanding:
 *                    purchases after the statement date, less refunds
 *
 * so `outstanding = currentBill + unbilled` always holds.
 *
 * If the card was added to the app after its latest statement date, the
 * opening outstanding is treated as the billed amount for that statement
 * until the user enters the statement's real total.
 */
import { outstandingFromBalance, computeBalances } from './balances';
import { addDays, addMonths, clampedDay, diffDays, parseDay, type Day } from './dates';
import { ratio, type Minor } from './money';
import type { Account, CardStatement, LedgerEntry } from './types';

type CardLike = Pick<
  Account,
  | 'id'
  | 'type'
  | 'openingBalance'
  | 'openingDate'
  | 'archived'
  | 'creditLimit'
  | 'statementDay'
  | 'dueDay'
>;

/** The latest statement date on or before `day`. */
export function statementDateOnOrBefore(day: Day, statementDay: number): Day {
  const { year, month } = parseDay(day);
  const thisMonth = clampedDay(year, month, statementDay);
  if (thisMonth <= day) return thisMonth;
  return addMonths(clampedDay(year, month, 1), -1, statementDay);
}

/** The first statement date strictly after `day`. */
export function nextStatementDate(day: Day, statementDay: number): Day {
  const { year, month } = parseDay(day);
  const thisMonth = clampedDay(year, month, statementDay);
  if (thisMonth > day) return thisMonth;
  return addMonths(clampedDay(year, month, 1), 1, statementDay);
}

/** The statement date before the given statement date. */
export function previousStatementDate(statementDate: Day, statementDay: number): Day {
  return statementDateOnOrBefore(addDays(statementDate, -1), statementDay);
}

/** The first occurrence of `dueDay` strictly after the statement date. */
export function dueDateFor(statementDate: Day, dueDay: number): Day {
  const { year, month } = parseDay(statementDate);
  const thisMonth = clampedDay(year, month, dueDay);
  if (thisMonth > statementDate) return thisMonth;
  return addMonths(clampedDay(year, month, 1), 1, dueDay);
}

export interface Cycle {
  start: Day;
  /** The statement date (inclusive). */
  end: Day;
}

/** The cycle that closes on the given statement date. */
export function cycleEndingOn(statementDate: Day, statementDay: number): Cycle {
  return {
    start: addDays(previousStatementDate(statementDate, statementDay), 1),
    end: statementDate,
  };
}

/** The open cycle that contains `day`. */
export function cycleContaining(day: Day, statementDay: number): Cycle {
  const last = statementDateOnOrBefore(day, statementDay);
  const end = last === day ? day : nextStatementDate(day, statementDay);
  return cycleEndingOn(end, statementDay);
}

function touchesCard(entry: LedgerEntry, cardId: string): boolean {
  return entry.accountId === cardId || entry.toAccountId === cardId;
}

/** Payments into the card (bill payments or transfers) in a day range. */
function paymentsBetween(
  entries: readonly LedgerEntry[],
  cardId: string,
  afterDay: Day,
  upTo: Day,
): Minor {
  let total = 0;
  for (const entry of entries) {
    if (entry.status !== 'cleared' || entry.toAccountId !== cardId) continue;
    if (entry.type !== 'card_payment' && entry.type !== 'transfer') continue;
    if (entry.day <= afterDay) continue;
    if (entry.day > upTo) continue;
    total += entry.amount;
  }
  return total;
}

export type BillState = 'none' | 'due' | 'due_soon' | 'due_today' | 'overdue' | 'paid';

export interface CardStatus {
  /** Total owed right now (negative means the card is in credit). */
  outstanding: Minor;
  /** Latest statement date on or before today, or null before the first cycle. */
  statementDate: Day | null;
  /** Total of the latest statement. */
  statementTotal: Minor;
  /** Payments made after the statement date. */
  paidSinceStatement: Minor;
  /** What is still to pay on the latest statement. */
  currentBill: Minor;
  /** Spending not yet on a statement. */
  unbilled: Minor;
  dueDate: Day | null;
  /** Days from today to the due date (negative when past). */
  daysUntilDue: number | null;
  minimumDue: Minor | null;
  billState: BillState;
  nextStatementDate: Day | null;
  /** outstanding / creditLimit as a fraction (0 when no limit is set). */
  utilisation: number;
  availableCredit: Minor | null;
  /** True when the statement total came from the user's typed figure. */
  statementTotalIsStated: boolean;
}

/** How many days before the due date a bill counts as "due soon". */
export const DUE_SOON_DAYS = 3;

/**
 * Current position of a credit card.
 * `entries` may include unrelated entries; they are ignored.
 */
export function cardStatus(
  card: CardLike,
  entries: readonly LedgerEntry[],
  today: Day,
  statements: readonly CardStatement[] = [],
): CardStatus {
  const own = entries.filter((e) => touchesCard(e, card.id));
  const balanceNow = computeBalances([card], own, { asOf: today }).get(card.id) ?? 0;
  const outstanding = outstandingFromBalance(balanceNow);
  const limit = card.creditLimit;
  const base = {
    outstanding,
    utilisation: limit && limit > 0 ? Math.max(0, ratio(outstanding, limit)) : 0,
    availableCredit: limit === null ? null : limit - outstanding,
  };

  if (card.statementDay === null) {
    return {
      ...base,
      statementDate: null,
      statementTotal: 0,
      paidSinceStatement: 0,
      currentBill: 0,
      unbilled: outstanding,
      dueDate: null,
      daysUntilDue: null,
      minimumDue: null,
      billState: 'none',
      nextStatementDate: null,
      statementTotalIsStated: false,
    };
  }

  const statementDate = statementDateOnOrBefore(today, card.statementDay);
  const record = statements.find(
    (s) => s.accountId === card.id && s.statementDate === statementDate,
  );
  const beforeOpening = statementDate < card.openingDate;

  let statementTotal: Minor;
  let statementTotalIsStated = false;
  if (record?.statedTotal != null) {
    statementTotal = Math.max(0, record.statedTotal);
    statementTotalIsStated = true;
  } else if (beforeOpening) {
    statementTotal = Math.max(0, outstandingFromBalance(card.openingBalance));
  } else {
    const closing = computeBalances([card], own, { asOf: statementDate }).get(card.id) ?? 0;
    statementTotal = Math.max(0, outstandingFromBalance(closing));
  }

  // Payments dated before the opening date are already part of the opening balance.
  const paymentsAfter = beforeOpening ? addDays(card.openingDate, -1) : statementDate;
  const paidSinceStatement = paymentsBetween(own, card.id, paymentsAfter, today);
  const currentBill = Math.max(0, statementTotal - paidSinceStatement);
  const dueDate = card.dueDay === null ? null : dueDateFor(statementDate, card.dueDay);
  const daysUntilDue = dueDate === null ? null : diffDays(today, dueDate);

  let billState: BillState;
  if (statementTotal === 0) billState = 'none';
  else if (currentBill === 0) billState = 'paid';
  else if (daysUntilDue === null) billState = 'due';
  else if (daysUntilDue < 0) billState = 'overdue';
  else if (daysUntilDue === 0) billState = 'due_today';
  else if (daysUntilDue <= DUE_SOON_DAYS) billState = 'due_soon';
  else billState = 'due';

  return {
    ...base,
    statementDate,
    statementTotal,
    paidSinceStatement,
    currentBill,
    unbilled: outstanding - currentBill,
    dueDate,
    daysUntilDue,
    minimumDue: record?.minimumDue ?? null,
    billState,
    nextStatementDate: nextStatementDate(today, card.statementDay),
    statementTotalIsStated,
  };
}

export interface CycleSummary {
  statementDate: Day;
  start: Day;
  end: Day;
  dueDate: Day | null;
  /** Purchases and fees charged in the cycle. */
  purchases: Minor;
  /** Refunds and cashback credited in the cycle. */
  credits: Minor;
  /** Payments received in the cycle. */
  payments: Minor;
  /** Outstanding at the end of the statement date (never below zero). */
  statementTotal: Minor;
  minimumDue: Minor | null;
  /** True for the cycle that has not closed yet. */
  open: boolean;
}

/** The open cycle followed by the most recent closed cycles, newest first. */
export function cycleHistory(
  card: CardLike,
  entries: readonly LedgerEntry[],
  today: Day,
  closedCount = 6,
  statements: readonly CardStatement[] = [],
): CycleSummary[] {
  if (card.statementDay === null) return [];
  const statementDay = card.statementDay;
  const own = entries.filter((e) => e.status === 'cleared' && touchesCard(e, card.id));
  const out: CycleSummary[] = [];
  const openEnd = cycleContaining(today, statementDay).end;
  let end = openEnd;
  for (let i = 0; i <= closedCount; i += 1) {
    const cycle = cycleEndingOn(end, statementDay);
    if (cycle.end < card.openingDate) break;
    let purchases = 0;
    let credits = 0;
    let payments = 0;
    for (const entry of own) {
      if (entry.day < cycle.start || entry.day > cycle.end || entry.day < card.openingDate)
        continue;
      if (entry.toAccountId === card.id) {
        payments += entry.amount;
      } else if (
        entry.type === 'expense' ||
        entry.type === 'transfer' ||
        entry.type === 'card_payment'
      ) {
        purchases += entry.amount;
      } else if (entry.type === 'adjustment') {
        if (entry.amount < 0) purchases += -entry.amount;
        else credits += entry.amount;
      } else {
        credits += entry.amount;
      }
    }
    const record = statements.find((s) => s.accountId === card.id && s.statementDate === end);
    const open = end > today;
    const closing = computeBalances([card], own, { asOf: open ? today : end }).get(card.id) ?? 0;
    out.push({
      statementDate: end,
      start: cycle.start,
      end: cycle.end,
      dueDate: card.dueDay === null ? null : dueDateFor(end, card.dueDay),
      purchases,
      credits,
      payments,
      statementTotal:
        record?.statedTotal != null
          ? Math.max(0, record.statedTotal)
          : Math.max(0, outstandingFromBalance(closing)),
      minimumDue: record?.minimumDue ?? null,
      open,
    });
    end = previousStatementDate(end, statementDay);
  }
  return out;
}
