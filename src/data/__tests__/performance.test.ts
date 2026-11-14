import { createTestDb } from '../../../test/db';
import { createAccount, getBalances } from '../accounts';
import { loadPeriodView, loadReports } from '../queries';
import { countTransactions, createTransactions, listTransactions } from '../transactions';
import { addDays } from '@/domain/dates';

describe('20,000 transactions', () => {
  const { db } = createTestDb();
  const bank = createAccount(db, {
    name: 'B',
    type: 'bank',
    openingBalance: 0,
    openingDate: '2020-01-01',
    currency: 'INR',
  });
  const inputs = Array.from({ length: 20_000 }, (_, i) => ({
    type: 'expense' as const,
    amount: 100 + (i % 900),
    day: addDays('2021-01-01', i % 1800),
    accountId: bank.id,
    payee: `Shop ${i % 300}`,
  }));
  createTransactions(db, inputs);

  const timed = (fn: () => unknown) => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };

  it("keeps the screens' queries fast (generous limits for slow CI)", () => {
    expect(countTransactions(db)).toBe(20_000);
    expect(timed(() => listTransactions(db, {}, { limit: 60, offset: 0 }))).toBeLessThan(100);
    expect(timed(() => listTransactions(db, {}, { limit: 60, offset: 19_000 }))).toBeLessThan(200);
    expect(
      timed(() =>
        listTransactions(db, { accountIds: [bank.id], minAmount: 500 }, { limit: 60, offset: 0 }),
      ),
    ).toBeLessThan(200);
    expect(timed(() => getBalances(db))).toBeLessThan(150);
    expect(
      timed(() =>
        loadPeriodView(db, '2025-01', { monthStartDay: 1, budgetWarningPercent: 80 }, '2025-01-20'),
      ),
    ).toBeLessThan(200);
    expect(
      timed(() => loadReports(db, { monthStartDay: 1 }, '2025-06-20', 12, '2025-06')),
    ).toBeLessThan(300);
  });
});
