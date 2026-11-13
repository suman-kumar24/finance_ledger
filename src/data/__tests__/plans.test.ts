import { createTestDb } from '../../../test/db';
import type { Db } from '@/db/types';
import { goalProgress } from '@/domain/goals';

import { createAccount, getBalances } from '../accounts';
import {
  addContribution,
  buyPurchase,
  createGoal,
  createPurchase,
  deleteContribution,
  deleteGoal,
  deletePurchase,
  getGoal,
  getPurchase,
  listContributions,
  listGoals,
  listPurchases,
  updateGoal,
  updatePurchase,
} from '../plans';
import { loadReports } from '../queries';
import { createTransaction, listTransactions } from '../transactions';

let db: Db;
let bank: string;
let fd: string;

beforeEach(() => {
  db = createTestDb().db;
  bank = createAccount(db, {
    name: 'Bank',
    type: 'bank',
    openingBalance: 100_000_00,
    openingDate: '2025-01-01',
    currency: 'INR',
  }).id;
  fd = createAccount(db, {
    name: 'FD',
    type: 'savings',
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
  }).id;
});

describe('goals', () => {
  it('tracks contributions and the monthly amount needed', () => {
    const goal = createGoal(db, {
      name: ' Trip ',
      targetAmount: 60_000_00,
      targetDate: '2025-09-10',
      accountId: null,
      color: '#000',
      icon: 'target',
    });
    addContribution(db, { goalId: goal.id, amount: 12_000_00, day: '2025-03-10' }, '2025-03-10');
    addContribution(
      db,
      { goalId: goal.id, amount: -2_000_00, day: '2025-03-11', note: ' oops ' },
      '2025-03-11',
    );
    const contributions = listContributions(db, goal.id);
    expect(contributions).toHaveLength(2);
    expect(contributions[0]).toMatchObject({
      amount: -2_000_00,
      note: 'oops',
      transactionId: null,
    });
    const progress = goalProgress(goal, contributions, '2025-03-10');
    expect(progress).toMatchObject({ saved: 10_000_00, monthsLeft: 6 });
    expect(progress.monthlyNeeded).toBe(Math.ceil(50_000_00 / 6));
    expect(getBalances(db).get(bank)).toBe(100_000_00);
    expect(getGoal(db, goal.id)?.name).toBe('Trip');
    expect(() =>
      addContribution(db, { goalId: goal.id, amount: 0, day: '2025-03-10' }, '2025-03-10'),
    ).toThrow();
    expect(() =>
      addContribution(db, { goalId: 'x', amount: 5, day: '2025-03-10' }, '2025-03-10'),
    ).toThrow();
  });

  it('records a transfer when the goal is linked to a savings account', () => {
    const goal = createGoal(db, {
      name: 'Fund',
      targetAmount: 60_000_00,
      targetDate: null,
      accountId: fd,
      color: '#000',
      icon: 'target',
    });
    const added = addContribution(
      db,
      { goalId: goal.id, amount: 5_000_00, day: '2025-03-10', fromAccountId: bank },
      '2025-03-10',
    );
    expect(added.transactionId).not.toBeNull();
    expect(listTransactions(db)[0]).toMatchObject({
      type: 'transfer',
      accountId: bank,
      toAccountId: fd,
      payee: 'Fund',
    });
    addContribution(
      db,
      { goalId: goal.id, amount: -1_000_00, day: '2025-03-12', fromAccountId: bank },
      '2025-03-12',
    );
    expect(getBalances(db).get(fd)).toBe(4_000_00);
    expect(getBalances(db).get(bank)).toBe(96_000_00);
    // Saving is never spending.
    expect(loadReports(db, { monthStartDay: 1 }, '2025-03-20', 6, '2025-03').summary).toMatchObject(
      { spending: 0, saved: 4_000_00 },
    );
  });

  it('edits, archives and deletes', () => {
    const goal = createGoal(db, {
      name: 'A',
      targetAmount: 100,
      targetDate: null,
      accountId: null,
      color: '#000',
      icon: 'target',
    });
    const c = addContribution(db, { goalId: goal.id, amount: 10, day: '2025-03-10' }, '2025-03-10');
    deleteContribution(db, c.id);
    expect(listContributions(db)).toEqual([]);
    updateGoal(db, goal.id, { name: ' B ', archived: true });
    expect(listGoals(db)).toEqual([]);
    expect(listGoals(db, { includeArchived: true })[0]?.name).toBe('B');
    addContribution(db, { goalId: goal.id, amount: 10, day: '2025-03-10' }, '2025-03-10');
    deleteGoal(db, goal.id);
    expect(getGoal(db, goal.id)).toBeNull();
    expect(listContributions(db)).toEqual([]);
  });
});

describe('planned purchases', () => {
  it('orders by status then priority', () => {
    createPurchase(db, { name: 'Low', estimatedPrice: 1, priority: 'low', fundingNotes: null });
    createPurchase(db, {
      name: 'High',
      estimatedPrice: 1,
      priority: 'high',
      fundingNotes: ' bonus ',
    });
    expect(listPurchases(db).map((p) => p.name)).toEqual(['High', 'Low']);
    expect(listPurchases(db)[0]?.fundingNotes).toBe('bonus');
  });

  it('turns into an expense when bought', () => {
    const p = createPurchase(db, {
      name: 'Washing machine',
      estimatedPrice: 30_000_00,
      priority: 'medium',
      fundingNotes: null,
      status: 'saving',
    });
    updatePurchase(db, p.id, { estimatedPrice: 32_000_00, fundingNotes: '' });
    const tx = buyPurchase(db, p.id, {
      amount: 31_500_00,
      day: '2025-03-10',
      accountId: bank,
      categoryId: null,
      method: 'upi',
    });
    expect(tx).toMatchObject({ type: 'expense', amount: 31_500_00, payee: 'Washing machine' });
    expect(getPurchase(db, p.id)).toMatchObject({
      status: 'bought',
      transactionId: tx.id,
      estimatedPrice: 32_000_00,
      fundingNotes: null,
    });
    expect(getBalances(db).get(bank)).toBe(100_000_00 - 31_500_00);
    expect(() =>
      buyPurchase(db, p.id, { amount: 1, day: '2025-03-10', accountId: bank }),
    ).toThrow();
    expect(() => buyPurchase(db, 'x', { amount: 1, day: '2025-03-10', accountId: bank })).toThrow();
    deletePurchase(db, p.id);
    expect(listTransactions(db)).toHaveLength(1);
  });
});

describe('reports view', () => {
  it('covers the trend range and compares with the previous month', () => {
    createTransaction(db, {
      type: 'expense',
      amount: 1_000_00,
      day: '2025-02-10',
      accountId: bank,
    });
    createTransaction(db, {
      type: 'expense',
      amount: 3_000_00,
      day: '2025-03-10',
      accountId: bank,
    });
    createTransaction(db, { type: 'income', amount: 9_000_00, day: '2024-08-10', accountId: bank });
    const view = loadReports(db, { monthStartDay: 1 }, '2025-03-20', 6, '2025-03');
    expect(view.trend.map((p) => p.key)).toEqual([
      '2024-10',
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
      '2025-03',
    ]);
    expect(view.trend.at(-1)).toMatchObject({ spending: 3_000_00 });
    expect(view.changes[0]).toMatchObject({ current: 3_000_00, previous: 1_000_00, percent: 200 });
    // Looking at an older month still finds its data.
    const old = loadReports(db, { monthStartDay: 1 }, '2025-03-20', 6, '2024-08');
    expect(old.summary.income).toBe(9_000_00);
  });
});
