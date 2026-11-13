import {
  addDays,
  addMonths,
  clampedDay,
  dayFromDate,
  dayFromTimestamp,
  daysInMonth,
  diffDays,
  eachDay,
  endOfMonth,
  isBetween,
  isLeapYear,
  isValidDay,
  maxDay,
  minDay,
  monthKeyOf,
  normalizeMonth,
  parseDay,
  startOfMonth,
  timestampFromDay,
  toDay,
  weekday,
} from '../dates';

describe('dates', () => {
  it('knows month lengths and leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('builds and validates days', () => {
    expect(toDay(2025, 3, 9)).toBe('2025-03-09');
    expect(clampedDay(2025, 2, 31)).toBe('2025-02-28');
    expect(clampedDay(2025, 2, 0)).toBe('2025-02-01');
    expect(isValidDay('2025-02-29')).toBe(false);
    expect(isValidDay('2024-02-29')).toBe(true);
    expect(isValidDay('2025-13-01')).toBe(false);
    expect(isValidDay('25-1-1')).toBe(false);
    expect(parseDay('2025-07-04')).toEqual({ year: 2025, month: 7, day: 4 });
    expect(() => parseDay('nope')).toThrow();
  });

  it('adds and diffs days across boundaries', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(diffDays('2025-01-01', '2025-01-31')).toBe(30);
    expect(diffDays('2025-02-01', '2025-01-31')).toBe(-1);
  });

  it('computes weekdays', () => {
    expect(weekday('2025-11-13')).toBe(4); // Thursday
    expect(weekday('2024-02-29')).toBe(4);
    expect(weekday('1969-12-28')).toBe(0); // Sunday before the epoch
  });

  it('adds months with clamping and anchors', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2025-02-28', 1, 31)).toBe('2025-03-31');
    expect(addMonths('2025-11-15', 2)).toBe('2026-01-15');
    expect(addMonths('2025-01-15', -1)).toBe('2024-12-15');
    expect(normalizeMonth(2025, 0)).toEqual({ year: 2024, month: 12 });
    expect(normalizeMonth(2025, 13)).toEqual({ year: 2026, month: 1 });
  });

  it('finds month edges and ranges', () => {
    expect(startOfMonth('2025-02-14')).toBe('2025-02-01');
    expect(endOfMonth('2025-02-14')).toBe('2025-02-28');
    expect(monthKeyOf('2025-02-14')).toBe('2025-02');
    expect(minDay('2025-01-02', '2025-01-01')).toBe('2025-01-01');
    expect(maxDay('2025-01-02', '2025-01-01')).toBe('2025-01-02');
    expect(isBetween('2025-01-02', '2025-01-01', '2025-01-03')).toBe(true);
    expect(isBetween('2025-01-04', '2025-01-01', '2025-01-03')).toBe(false);
    expect(eachDay('2025-02-27', '2025-03-01')).toEqual(['2025-02-27', '2025-02-28', '2025-03-01']);
  });

  it('converts to and from local timestamps', () => {
    const ts = timestampFromDay('2025-06-15', 9, 30);
    expect(dayFromTimestamp(ts)).toBe('2025-06-15');
    expect(dayFromDate(new Date(2025, 0, 5, 23, 59))).toBe('2025-01-05');
  });
});
