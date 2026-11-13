import {
  normalizeStartDay,
  parsePeriodKey,
  periodForDay,
  periodFromKey,
  periodProgress,
  recentPeriodKeys,
  shiftPeriodKey,
} from '../months';

describe('calendar months (rule 7 default)', () => {
  it('covers the whole calendar month', () => {
    expect(periodFromKey('2025-02')).toEqual({
      key: '2025-02',
      start: '2025-02-01',
      end: '2025-02-28',
      days: 28,
    });
    expect(periodFromKey('2024-02').days).toBe(29);
    expect(periodForDay('2025-12-31').key).toBe('2025-12');
    expect(periodForDay('2026-01-01').key).toBe('2026-01');
  });
});

describe('pay-day months (rule 7 option)', () => {
  it('runs from the 30th to the 29th and is named after the month it ends in', () => {
    const p = periodFromKey('2025-11', 30);
    expect(p.start).toBe('2025-10-30');
    expect(p.end).toBe('2025-11-29');
    expect(p.days).toBe(31);
  });

  it('clamps a start day the month does not have', () => {
    const march = periodFromKey('2025-03', 30);
    expect(march.start).toBe('2025-02-28');
    expect(march.end).toBe('2025-03-29');
    const feb = periodFromKey('2025-02', 30);
    expect(feb.start).toBe('2025-01-30');
    expect(feb.end).toBe('2025-02-27');
  });

  it('leaves no gaps and no overlaps across a year', () => {
    for (const startDay of [1, 5, 15, 16, 25, 28, 29, 30, 31]) {
      let key = '2024-01';
      let previousEnd: string | null = null;
      for (let i = 0; i < 26; i += 1) {
        const p = periodFromKey(key, startDay);
        if (previousEnd !== null) {
          const next = new Date(`${previousEnd}T00:00:00Z`);
          next.setUTCDate(next.getUTCDate() + 1);
          expect(p.start).toBe(next.toISOString().slice(0, 10));
        }
        expect(p.end >= p.start).toBe(true);
        previousEnd = p.end;
        key = shiftPeriodKey(key, 1);
      }
    }
  });

  it('finds the period for any day, consistently with periodFromKey', () => {
    for (const startDay of [1, 7, 15, 16, 30, 31]) {
      for (const day of [
        '2025-01-01',
        '2025-02-27',
        '2025-02-28',
        '2025-03-01',
        '2025-03-30',
        '2025-12-31',
        '2024-02-29',
      ]) {
        const p = periodForDay(day, startDay);
        expect(day >= p.start && day <= p.end).toBe(true);
        expect(periodFromKey(p.key, startDay)).toEqual(p);
      }
    }
  });

  it('names a period starting on day 1-15 after its start month', () => {
    const p = periodForDay('2025-03-20', 7);
    expect(p).toMatchObject({ key: '2025-03', start: '2025-03-07', end: '2025-04-06' });
    expect(periodForDay('2025-03-03', 7).key).toBe('2025-02');
  });

  it('names a period starting on day 16-31 after its end month', () => {
    expect(periodForDay('2025-10-30', 30).key).toBe('2025-11');
    expect(periodForDay('2025-10-29', 30).key).toBe('2025-10');
    expect(periodForDay('2025-12-31', 25).key).toBe('2026-01');
  });
});

describe('period helpers', () => {
  it('shifts keys across years', () => {
    expect(shiftPeriodKey('2025-01', -1)).toBe('2024-12');
    expect(shiftPeriodKey('2025-12', 1)).toBe('2026-01');
    expect(shiftPeriodKey('2025-06', 0)).toBe('2025-06');
    expect(recentPeriodKeys('2025-02', 4)).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('validates keys and start days', () => {
    expect(() => parsePeriodKey('2025-13')).toThrow();
    expect(() => parsePeriodKey('nope')).toThrow();
    expect(normalizeStartDay(0)).toBe(1);
    expect(normalizeStartDay(45)).toBe(31);
    expect(normalizeStartDay(2.5)).toBe(1);
  });

  it('reports progress through a period', () => {
    const p = periodFromKey('2025-11');
    expect(periodProgress(p, '2025-11-13')).toEqual({
      state: 'current',
      dayNumber: 13,
      totalDays: 30,
      daysLeft: 17,
    });
    expect(periodProgress(p, '2025-12-05')).toMatchObject({
      state: 'past',
      dayNumber: 30,
      daysLeft: 0,
    });
    expect(periodProgress(p, '2025-10-05')).toMatchObject({
      state: 'future',
      dayNumber: 0,
      daysLeft: 30,
    });
  });
});
