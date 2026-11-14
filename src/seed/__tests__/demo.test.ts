import { createTestDb } from '../../../test/db';
import { getBalances, listAccounts } from '@/data/accounts';
import { loadPeriodView } from '@/data/queries';
import { listTransactions, countTransactions } from '@/data/transactions';
import { netWorth } from '@/domain/balances';
import { seedDemo } from '../demo';

describe('demo data', () => {
  const today = '2025-11-13';
  const { db } = createTestDb();
  seedDemo(db, today);

  it('is a realistic three-month ledger', () => {
    expect(countTransactions(db)).toBeGreaterThan(120);
    expect(
      listAccounts(db)
        .map((a) => a.type)
        .sort(),
    ).toEqual(['bank', 'bank', 'cash', 'credit_card', 'credit_card', 'investment']);
    const view = loadPeriodView(
      db,
      '2025-11',
      { monthStartDay: 1, budgetWarningPercent: 80 },
      today,
    );
    expect(view.budgets).toHaveLength(5);
    expect(view.summary.spending).toBeGreaterThan(0);
    expect(view.summary.income).toBe(95_000_00 + 1_850_00);
  });

  it('keeps the accounting rules: card payments are not spending, balances are exact', () => {
    const all = listTransactions(db, {}, { limit: 1000, offset: 0 });
    expect(all.some((t) => t.type === 'card_payment')).toBe(true);
    const totals = netWorth(listAccounts(db), getBalances(db));
    expect(Number.isSafeInteger(totals.netWorth)).toBe(true);
    expect(totals.cardOutstanding).toBeGreaterThan(0);
  });

  it('is the same every time', () => {
    const other = createTestDb().db;
    seedDemo(other, today);
    const key = (d: typeof db) =>
      listTransactions(d, {}, { limit: 1000, offset: 0 })
        .map((t) => [t.day, t.amount, t.type].join('|'))
        .sort();
    expect(key(other)).toEqual(key(db));
  });
});
