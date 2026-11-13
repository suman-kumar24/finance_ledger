/**
 * Calendar-day utilities.
 *
 * A `Day` is a local calendar date written "YYYY-MM-DD". All month, cycle and
 * budget maths works on days, never on timestamps, so results do not depend
 * on the device time zone. String comparison orders days correctly.
 */

export type Day = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface YMD {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a month; month is 1-12. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function toDay(year: number, month: number, day: number): Day {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Builds a day, clamping the day-of-month to the month's length (31 Feb -> 28/29 Feb). */
export function clampedDay(year: number, month: number, day: number): Day {
  return toDay(year, month, Math.min(Math.max(day, 1), daysInMonth(year, month)));
}

export function isValidDay(value: string): value is Day {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseDay(value: Day): YMD {
  const m = DAY_RE.exec(value);
  if (!m || !isValidDay(value)) throw new Error(`Invalid day: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function toEpochDays(value: Day): number {
  const { year, month, day } = parseDay(value);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function fromEpochDays(days: number): Day {
  const d = new Date(days * MS_PER_DAY);
  return toDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(value: Day, count: number): Day {
  return fromEpochDays(toEpochDays(value) + count);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: Day, to: Day): number {
  return toEpochDays(to) - toEpochDays(from);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(value: Day): number {
  return (((toEpochDays(value) + 4) % 7) + 7) % 7;
}

/** Normalises a (year, month) pair where month may be outside 1-12. */
export function normalizeMonth(year: number, month: number): { year: number; month: number } {
  const index = year * 12 + (month - 1);
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/**
 * Adds months, keeping the day-of-month where possible and clamping to the
 * month end otherwise. `anchorDay` lets a series remember its original day so
 * 31 Jan -> 28 Feb -> 31 Mar (not 28 Mar).
 */
export function addMonths(value: Day, count: number, anchorDay?: number): Day {
  const { year, month, day } = parseDay(value);
  const target = normalizeMonth(year, month + count);
  return clampedDay(target.year, target.month, anchorDay ?? day);
}

export function startOfMonth(value: Day): Day {
  const { year, month } = parseDay(value);
  return toDay(year, month, 1);
}

export function endOfMonth(value: Day): Day {
  const { year, month } = parseDay(value);
  return toDay(year, month, daysInMonth(year, month));
}

export function minDay(a: Day, b: Day): Day {
  return a <= b ? a : b;
}

export function maxDay(a: Day, b: Day): Day {
  return a >= b ? a : b;
}

export function isBetween(value: Day, start: Day, end: Day): boolean {
  return value >= start && value <= end;
}

/** The local calendar day of a JS Date (uses the device time zone). */
export function dayFromDate(date: Date): Day {
  return toDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** The local calendar day of an epoch-millisecond timestamp. */
export function dayFromTimestamp(ms: number): Day {
  return dayFromDate(new Date(ms));
}

/** Local-time timestamp for a day at the given hour and minute. */
export function timestampFromDay(value: Day, hour = 12, minute = 0): number {
  const { year, month, day } = parseDay(value);
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

/** Every day from start to end inclusive. */
export function eachDay(start: Day, end: Day): Day[] {
  const out: Day[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "YYYY-MM" key of a day. */
export function monthKeyOf(value: Day): string {
  return value.slice(0, 7);
}
