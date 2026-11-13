/**
 * Budget periods ("months").
 *
 * By default a period is a calendar month. With a custom start day (for
 * example pay day on the 30th) a period runs from that day to the day before
 * it in the next month. A start day that a month does not have is clamped to
 * the month's last day.
 *
 * Naming rule: a period that starts on day 1-15 is named after the month it
 * starts in; a period that starts on day 16-31 is named after the month it
 * ends in (where most of its days fall). So with start day 30, "March" is
 * 28 Feb - 29 Mar in a non-leap year.
 */
import { addDays, clampedDay, diffDays, normalizeMonth, parseDay, type Day } from './dates';

export interface Period {
  /** "YYYY-MM" */
  key: string;
  start: Day;
  end: Day;
  /** Number of days in the period. */
  days: number;
}

function keyOf(year: number, month: number): string {
  const n = normalizeMonth(year, month);
  return `${String(n.year).padStart(4, '0')}-${String(n.month).padStart(2, '0')}`;
}

export function parsePeriodKey(key: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid period key: ${key}`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid period key: ${key}`);
  return { year: Number(m[1]), month };
}

export function normalizeStartDay(startDay: number): number {
  if (!Number.isInteger(startDay) || startDay < 1) return 1;
  return Math.min(startDay, 31);
}

function namedAfterEnd(startDay: number): boolean {
  return startDay > 15;
}

function clamped(year: number, month: number, day: number): Day {
  const n = normalizeMonth(year, month);
  return clampedDay(n.year, n.month, day);
}

/** The period with the given key. */
export function periodFromKey(key: string, monthStartDay = 1): Period {
  const startDay = normalizeStartDay(monthStartDay);
  const { year, month } = parsePeriodKey(key);
  const startMonth = namedAfterEnd(startDay) ? month - 1 : month;
  const start = clamped(year, startMonth, startDay);
  const end = addDays(clamped(year, startMonth + 1, startDay), -1);
  return { key: keyOf(year, month), start, end, days: diffDays(start, end) + 1 };
}

/** The period that contains the given day. */
export function periodForDay(day: Day, monthStartDay = 1): Period {
  const startDay = normalizeStartDay(monthStartDay);
  const { year, month } = parseDay(day);
  const startsThisMonth = day >= clampedDay(year, month, startDay);
  const startMonth = startsThisMonth ? month : month - 1;
  const keyMonth = namedAfterEnd(startDay) ? startMonth + 1 : startMonth;
  return periodFromKey(keyOf(year, keyMonth), startDay);
}

/** The key `count` periods after (or before, if negative) the given key. */
export function shiftPeriodKey(key: string, count: number): string {
  const { year, month } = parsePeriodKey(key);
  return keyOf(year, month + count);
}

/** Keys of the `count` periods ending with `lastKey`, oldest first. */
export function recentPeriodKeys(lastKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftPeriodKey(lastKey, i - (count - 1)));
}

export type PeriodState = 'past' | 'current' | 'future';

export interface PeriodProgress {
  state: PeriodState;
  /** 1-based day number within the period (clamped to the period). */
  dayNumber: number;
  totalDays: number;
  daysLeft: number;
}

/** Where `today` falls in a period: "day 13 of 30". */
export function periodProgress(period: Period, today: Day): PeriodProgress {
  if (today < period.start) {
    return { state: 'future', dayNumber: 0, totalDays: period.days, daysLeft: period.days };
  }
  if (today > period.end) {
    return { state: 'past', dayNumber: period.days, totalDays: period.days, daysLeft: 0 };
  }
  const dayNumber = diffDays(period.start, today) + 1;
  return {
    state: 'current',
    dayNumber,
    totalDays: period.days,
    daysLeft: period.days - dayNumber,
  };
}
