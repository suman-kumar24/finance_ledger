import { account, budget, category, entry, mapById } from '../../../test/factories';
import {
  alertKeysToRecord,
  budgetAlertKey,
  budgetState,
  budgetStatus,
  budgetTotals,
  copyBudgets,
  dueBudgetAlerts,
  pace,
  type BudgetStatus,
} from '../budgets';
import { periodFromKey, periodProgress } from '../months';
import { summarize } from '../spending';

const categories = mapById([
  category('food'),
  category('dining', 'expense', 'food'),
  category('groceries'),
  category('fun'),
]);
const ctx = { accounts: mapById([account('bank', 'bank')]), categories };

function status(spent: number, limit: number, seriesId = 'b1'): BudgetStatus {
  return {
    budgetId: seriesId,
    seriesId,
    name: seriesId,
    limit,
    spent,
    remaining: limit - spent,
    percent: Math.floor((spent * 100) / limit),
    state: budgetState(spent, limit),
  };
}

describe('budget state', () => {
  it('warns at 80% and is over only past the limit', () => {
    expect(budgetState(799_99, 1_000_00)).toBe('ok');
    expect(budgetState(800_00, 1_000_00)).toBe('warning');
    expect(budgetState(1_000_00, 1_000_00)).toBe('warning');
    expect(budgetState(1_000_01, 1_000_00)).toBe('over');
  });

  it('honours a custom threshold', () => {
    expect(budgetState(600_00, 1_000_00, 60)).toBe('warning');
    expect(budgetState(600_00, 1_000_00, 90)).toBe('ok');
  });

  it('handles a zero limit', () => {
    expect(budgetState(0, 0)).toBe('ok');
    expect(budgetState(1, 0)).toBe('over');
  });
});

describe('budget groups', () => {
  const entries = [
    entry('expense', 3_000_00, '2025-03-02', 'bank', { categoryId: 'dining' }),
    entry('expense', 5_500_00, '2025-03-03', 'bank', { categoryId: 'groceries' }),
    entry('refund', 500_00, '2025-03-04', 'bank', { categoryId: 'groceries' }),
    entry('expense', 900_00, '2025-03-05', 'bank', { categoryId: 'fun' }),
  ];
  const summary = summarize(entries, ctx);

  it('covers several categories, including subcategories of a chosen parent', () => {
    const food = budget('food-group', 10_000_00, ['food', 'groceries']);
    expect(budgetStatus(food, summary, categories)).toMatchObject({
      spent: 8_000_00,
      remaining: 2_000_00,
      percent: 80,
      state: 'warning',
    });
  });

  it('goes over budget with a negative remaining amount', () => {
    const fun = budget('fun', 500_00, ['fun']);
    expect(budgetStatus(fun, summary, categories)).toMatchObject({
      remaining: -400_00,
      percent: 180,
      state: 'over',
    });
  });

  it('totals limits and spending', () => {
    const statuses = [
      budgetStatus(budget('a', 10_000_00, ['food', 'groceries']), summary, categories),
      budgetStatus(budget('b', 500_00, ['fun']), summary, categories),
    ];
    expect(budgetTotals(statuses)).toEqual({ limit: 10_500_00, budgetedSpent: 8_900_00 });
  });
});

describe('pace', () => {
  const november = periodFromKey('2025-11');
  const day13 = periodProgress(november, '2025-11-13');

  it('compares spending with an even spread of the limit', () => {
    const p = pace(13_000_00, 30_000_00, day13);
    expect(p.expected).toBe(13_000_00);
    expect(p.state).toBe('on');
    expect(p.perDayLeft).toBe(Math.floor(17_000_00 / 18));
  });

  it('flags spending ahead of or under pace beyond the tolerance', () => {
    expect(pace(14_500_00, 30_000_00, day13).state).toBe('on');
    expect(pace(14_500_01, 30_000_00, day13).state).toBe('ahead');
    expect(pace(11_499_99, 30_000_00, day13).state).toBe('under');
  });

  it('handles past and future periods', () => {
    const past = pace(20_000_00, 30_000_00, periodProgress(november, '2025-12-10'));
    expect(past).toMatchObject({ expected: 30_000_00, state: 'under', perDayLeft: 0 });
    const future = pace(0, 30_000_00, periodProgress(november, '2025-10-10'));
    expect(future).toMatchObject({ expected: 0, state: 'on', perDayLeft: 1_000_00 });
    expect(pace(40_000_00, 30_000_00, day13).perDayLeft).toBe(0);
  });
});

describe('budget alerts (brief §8)', () => {
  const period = '2025-03';

  it('fires once at the threshold', () => {
    const alerts = dueBudgetAlerts([status(800_00, 1_000_00)], period, new Set());
    expect(alerts.map((a) => a.level)).toEqual(['warning']);
    const fired = new Set(alertKeysToRecord(alerts[0]!, period));
    expect(dueBudgetAlerts([status(900_00, 1_000_00)], period, fired)).toEqual([]);
  });

  it('fires once when exceeded, then once more a further 10% over', () => {
    const fired = new Set<string>([budgetAlertKey('b1', period, 'warning')]);
    const over = dueBudgetAlerts([status(1_050_00, 1_000_00)], period, fired);
    expect(over.map((a) => a.level)).toEqual(['over']);
    for (const k of alertKeysToRecord(over[0]!, period)) fired.add(k);
    expect(dueBudgetAlerts([status(1_090_00, 1_000_00)], period, fired)).toEqual([]);
    const further = dueBudgetAlerts([status(1_100_00, 1_000_00)], period, fired);
    expect(further.map((a) => a.level)).toEqual(['further_over']);
    for (const k of alertKeysToRecord(further[0]!, period)) fired.add(k);
    expect(dueBudgetAlerts([status(5_000_00, 1_000_00)], period, fired)).toEqual([]);
  });

  it('sends only the highest level when one entry jumps several levels', () => {
    const alerts = dueBudgetAlerts([status(1_200_00, 1_000_00)], period, new Set());
    expect(alerts.map((a) => a.level)).toEqual(['further_over']);
    expect(alertKeysToRecord(alerts[0]!, period)).toHaveLength(3);
  });

  it('fires again in a new month and separately per group', () => {
    const fired = new Set<string>([budgetAlertKey('b1', '2025-02', 'warning')]);
    const alerts = dueBudgetAlerts(
      [status(850_00, 1_000_00), status(100_00, 1_000_00, 'b2')],
      period,
      fired,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.key).toBe('budget:b1:2025-03:warning');
  });

  it('uses the configured threshold and skips budgets without a limit', () => {
    expect(dueBudgetAlerts([status(650_00, 1_000_00)], period, new Set(), 60)).toHaveLength(1);
    expect(dueBudgetAlerts([{ ...status(10, 1), limit: 0 }], period, new Set())).toEqual([]);
  });
});

describe('copying budgets', () => {
  let n = 0;
  const newId = () => `new-${(n += 1)}`;
  const source = [
    budget('a', 1_000_00, ['food'], { period: '2025-02' }),
    budget('b', 2_000_00, ['fun'], { period: '2025-02', recurring: false }),
  ];

  it('copies last month into a new period with new ids and the same series', () => {
    const copies = copyBudgets(source, '2025-03', [], newId);
    expect(copies).toHaveLength(2);
    expect(copies[0]).toMatchObject({ seriesId: 'a', period: '2025-03', limit: 1_000_00 });
    expect(copies[0]!.id).not.toBe('a');
    expect(copies[0]!.categoryIds).not.toBe(source[0]!.categoryIds);
  });

  it('skips series already present and can copy only recurring budgets', () => {
    const existing = [budget('x', 1, [], { seriesId: 'a', period: '2025-03' })];
    expect(copyBudgets(source, '2025-03', existing, newId).map((b) => b.seriesId)).toEqual(['b']);
    expect(
      copyBudgets(source, '2025-03', [], newId, { recurringOnly: true }).map((b) => b.seriesId),
    ).toEqual(['a']);
  });
});
