/**
 * Recurring rules: rent, SIPs, subscriptions and EMIs.
 */
import { addDays, addMonths, parseDay, type Day } from './dates';
import type { RecurringRule } from './types';

type Schedule = Pick<
  RecurringRule,
  'frequency' | 'interval' | 'anchorDay' | 'nextDate' | 'endDate'
>;

/** The occurrence after `date` for the rule's frequency. */
export function occurrenceAfter(schedule: Schedule, date: Day): Day {
  const interval = Math.max(1, schedule.interval);
  const anchor = schedule.anchorDay ?? parseDay(date).day;
  switch (schedule.frequency) {
    case 'daily':
      return addDays(date, interval);
    case 'weekly':
      return addDays(date, 7 * interval);
    case 'monthly':
      return addMonths(date, interval, anchor);
    case 'quarterly':
      return addMonths(date, 3 * interval, anchor);
    case 'yearly':
      return addMonths(date, 12 * interval, anchor);
  }
}

/** Occurrence dates from the rule's next date up to `until`, inclusive. */
export function occurrencesUntil(schedule: Schedule, until: Day, max = 120): Day[] {
  const out: Day[] = [];
  let date = schedule.nextDate;
  while (date <= until && out.length < max) {
    if (schedule.endDate !== null && date > schedule.endDate) break;
    out.push(date);
    date = occurrenceAfter(schedule, date);
  }
  return out;
}

export interface DueResult {
  /** Occurrences that are due (on or before today). */
  due: Day[];
  /** The rule's next date after those occurrences. */
  nextDate: Day;
  /** False once the rule has passed its end date. */
  stillActive: boolean;
}

/** Works out which occurrences are due and where the rule moves to. */
export function resolveDue(rule: Schedule & Pick<RecurringRule, 'active'>, today: Day): DueResult {
  if (!rule.active) return { due: [], nextDate: rule.nextDate, stillActive: false };
  const due = occurrencesUntil(rule, today);
  let nextDate = rule.nextDate;
  const last = due[due.length - 1];
  if (last !== undefined) nextDate = occurrenceAfter(rule, last);
  const stillActive = rule.endDate === null || nextDate <= rule.endDate;
  return { due, nextDate, stillActive };
}

/** Rough monthly cost of a rule, for the "commitments" total (minor units). */
export function monthlyEquivalent(
  rule: Pick<RecurringRule, 'amount' | 'frequency' | 'interval'>,
): number {
  const interval = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case 'daily':
      return Math.round((rule.amount * 365) / 12 / interval);
    case 'weekly':
      return Math.round((rule.amount * 52) / 12 / interval);
    case 'monthly':
      return Math.round(rule.amount / interval);
    case 'quarterly':
      return Math.round(rule.amount / (3 * interval));
    case 'yearly':
      return Math.round(rule.amount / (12 * interval));
  }
}
