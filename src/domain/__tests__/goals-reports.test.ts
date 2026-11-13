import { account, category, entry, mapById } from '../../../test/factories';
import { goalProgress, monthsUntil } from '../goals';
import { categoryBreakdown, categoryChanges, monthlyTrend, niceMax } from '../reports';
import { summarize, UNCATEGORIZED } from '../spending';

describe('goals', () => {
  it('counts months left including the current one', () => {
    expect(monthsUntil('2025-03-10', '2025-03-10')).toBe(0);
    expect(monthsUntil('2025-03-10', '2025-03-01')).toBe(0);
    expect(monthsUntil('2025-03-10', '2025-03-25')).toBe(1);
    expect(monthsUntil('2025-03-10', '2025-04-10')).toBe(1);
    expect(monthsUntil('2025-03-10', '2025-04-11')).toBe(2);
    expect(monthsUntil('2025-03-31', '2025-04-01')).toBe(1);
    expect(monthsUntil('2025-03-10', '2026-03-10')).toBe(12);
  });

  it('works out the monthly amount needed, rounding up', () => {
    const goal = { targetAmount: 1_00_000_00, targetDate: '2025-12-10' };
    const p = goalProgress(
      goal,
      [{ amount: 10_000_00 }, { amount: 5_000_00 }, { amount: -1_000_00 }],
      '2025-03-10',
    );
    expect(p).toMatchObject({
      saved: 14_000_00,
      remaining: 86_000_00,
      percent: 14,
      state: 'active',
      monthsLeft: 9,
    });
    expect(p.monthlyNeeded).toBe(Math.ceil(86_000_00 / 9));
    expect(p.monthlyNeeded! * 9).toBeGreaterThanOrEqual(86_000_00);
    expect(p.fraction).toBeCloseTo(0.14);
  });

  it('handles reached, past-due, open-ended and empty goals', () => {
    expect(
      goalProgress(
        { targetAmount: 100, targetDate: '2025-12-10' },
        [{ amount: 150 }],
        '2025-03-10',
      ),
    ).toMatchObject({
      state: 'reached',
      remaining: 0,
      monthlyNeeded: 0,
      fraction: 1,
      percent: 150,
    });
    expect(
      goalProgress({ targetAmount: 100, targetDate: null }, [{ amount: 100 }], '2025-03-10')
        .monthsLeft,
    ).toBeNull();
    expect(
      goalProgress({ targetAmount: 100, targetDate: '2025-01-01' }, [{ amount: 40 }], '2025-03-10'),
    ).toMatchObject({
      state: 'past_due',
      monthlyNeeded: 60,
      monthsLeft: 0,
    });
    expect(goalProgress({ targetAmount: 100, targetDate: null }, [], '2025-03-10')).toMatchObject({
      state: 'open_ended',
      monthlyNeeded: null,
      saved: 0,
    });
    expect(
      goalProgress({ targetAmount: 0, targetDate: null }, [{ amount: -5 }], '2025-03-10'),
    ).toMatchObject({
      fraction: 0,
      percent: 0,
      state: 'open_ended',
    });
  });
});

describe('reports', () => {
  const categories = mapById([
    category('food'),
    category('dining', 'expense', 'food'),
    category('fun'),
    category('salary', 'income'),
  ]);
  const ctx = {
    accounts: mapById([account('bank', 'bank'), account('fund', 'investment')]),
    categories,
  };
  const entries = [
    entry('income', 50_000_00, '2025-02-01', 'bank', { categoryId: 'salary' }),
    entry('expense', 4_000_00, '2025-02-10', 'bank', { categoryId: 'food' }),
    entry('expense', 1_000_00, '2025-02-11', 'bank', { categoryId: 'fun' }),
    entry('income', 50_000_00, '2025-03-01', 'bank', { categoryId: 'salary' }),
    entry('expense', 5_000_00, '2025-03-10', 'bank', { categoryId: 'dining' }),
    entry('expense', 1_000_00, '2025-03-12', 'bank'),
    entry('transfer', 10_000_00, '2025-03-05', 'bank', { toAccountId: 'fund' }),
  ];

  it('builds the monthly trend', () => {
    expect(monthlyTrend(entries, ctx, ['2025-01', '2025-02', '2025-03'], 1)).toEqual([
      { key: '2025-01', spending: 0, income: 0, saved: 0 },
      { key: '2025-02', spending: 5_000_00, income: 50_000_00, saved: 0 },
      { key: '2025-03', spending: 6_000_00, income: 50_000_00, saved: 10_000_00 },
    ]);
  });

  it('follows a custom month start', () => {
    const trend = monthlyTrend(entries, ctx, ['2025-03'], 12);
    // 12 Mar - 11 Apr: only the uncategorised expense on the 12th.
    expect(trend[0]?.spending).toBe(1_000_00);
  });

  it('breaks spending down by top-level category with shares', () => {
    const march = summarize(entries, ctx, { start: '2025-03-01', end: '2025-03-31' });
    const rows = categoryBreakdown(march, categories);
    expect(rows.map((r) => r.categoryId)).toEqual(['food', UNCATEGORIZED]);
    expect(rows[0]?.share).toBeCloseTo(5 / 6);
    expect(categoryBreakdown(summarize([], ctx), categories)).toEqual([]);
  });

  it('compares each category with the previous month', () => {
    const feb = summarize(entries, ctx, { start: '2025-02-01', end: '2025-02-28' });
    const march = summarize(entries, ctx, { start: '2025-03-01', end: '2025-03-31' });
    expect(categoryChanges(march, feb, categories)).toEqual([
      {
        categoryId: UNCATEGORIZED,
        current: 1_000_00,
        previous: 0,
        change: 1_000_00,
        percent: null,
      },
      { categoryId: 'food', current: 5_000_00, previous: 4_000_00, change: 1_000_00, percent: 25 },
      { categoryId: 'fun', current: 0, previous: 1_000_00, change: -1_000_00, percent: -100 },
    ]);
  });

  it('picks a tidy chart maximum', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(87)).toBe(100);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(2400)).toBe(2500);
    expect(niceMax(4100)).toBe(5000);
    expect(niceMax(1000)).toBe(1000);
  });
});
