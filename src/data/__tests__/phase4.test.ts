import { createTestDb } from '../../../test/db';
import type { Db } from '@/db/types';

import { createAccount, getBalances } from '../accounts';
import { firedAlertKeys, takeBudgetAlerts } from '../alerts';
import {
  copyLastBudgets,
  createBudget,
  deleteBudget,
  ensureRecurringBudgets,
  listBudgets,
  previousBudgetPeriod,
  updateBudget,
} from '../budgets';
import { createCategory } from '../categories';
import { runMaintenance } from '../maintenance';
import { loadAccountsView, loadPeriodView } from '../queries';
import { lastReconciliation, recordReconciliation } from '../reconcile';
import {
  createRecurringRule,
  deleteRecurringRule,
  getRecurringRule,
  listRecurringRules,
  processRecurring,
  recordOccurrence,
  setRecurringActive,
  skipOccurrence,
  updateRecurringRule,
  type RecurringInput,
} from '../recurring';
import { getSettings } from '../settings';
import { createTransaction, listTransactions } from '../transactions';
import { wipeAllData } from '../wipe';
import { reconcile } from '@/domain/reconcile';

let db: Db;
let bank: string;
let fund: string;
let food: string;
let fun: string;
const settings = { monthStartDay: 1, budgetWarningPercent: 80 };

beforeEach(() => {
  db = createTestDb().db;
  bank = createAccount(db, {
    name: 'Bank',
    type: 'bank',
    openingBalance: 100_000_00,
    openingDate: '2025-01-01',
    currency: 'INR',
  }).id;
  fund = createAccount(db, {
    name: 'Fund',
    type: 'investment',
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
  }).id;
  food = createCategory(db, { name: 'Food', kind: 'expense' }).id;
  fun = createCategory(db, { name: 'Fun', kind: 'expense' }).id;
});

describe('budgets', () => {
  it('creates, updates and reads a budget group with its categories', () => {
    const b = createBudget(db, {
      name: ' Food ',
      period: '2025-03',
      limit: 10_000_00,
      recurring: true,
      categoryIds: [food, food],
    });
    expect(listBudgets(db, '2025-03')).toMatchObject([
      { name: 'Food', categoryIds: [food], seriesId: b.id },
    ]);
    updateBudget(db, b.id, {
      limit: 12_000_00,
      categoryIds: [food, fun],
      recurring: false,
      name: 'Food & fun',
    });
    expect(listBudgets(db, '2025-03')[0]).toMatchObject({
      limit: 12_000_00,
      recurring: false,
      name: 'Food & fun',
    });
    expect(listBudgets(db, '2025-03')[0]?.categoryIds.sort()).toEqual([food, fun].sort());
    expect(listBudgets(db, '2025-04')).toEqual([]);
  });

  it("copies last month's budgets once", () => {
    createBudget(db, {
      name: 'Food',
      period: '2025-02',
      limit: 10_000_00,
      recurring: true,
      categoryIds: [food],
    });
    createBudget(db, {
      name: 'Fun',
      period: '2025-02',
      limit: 2_000_00,
      recurring: false,
      categoryIds: [fun],
    });
    expect(previousBudgetPeriod(db, '2025-04')).toBe('2025-02');
    expect(copyLastBudgets(db, '2025-04')).toBe(2);
    expect(copyLastBudgets(db, '2025-04')).toBe(0);
    expect(listBudgets(db, '2025-04').map((b) => b.name)).toEqual(['Food', 'Fun']);
    expect(copyLastBudgets(db, '2025-01')).toBe(0);
  });

  it('carries only recurring budgets into a new month, and only when it is empty', () => {
    const keep = createBudget(db, {
      name: 'Food',
      period: '2025-02',
      limit: 10_000_00,
      recurring: true,
      categoryIds: [food],
    });
    createBudget(db, {
      name: 'Trip',
      period: '2025-02',
      limit: 2_000_00,
      recurring: false,
      categoryIds: [fun],
    });
    expect(ensureRecurringBudgets(db, '2025-03')).toBe(1);
    expect(ensureRecurringBudgets(db, '2025-03')).toBe(0);
    const march = listBudgets(db, '2025-03');
    expect(march).toMatchObject([{ name: 'Food', seriesId: keep.seriesId, categoryIds: [food] }]);
  });

  it('stops a deleted budget from coming back next month', () => {
    createBudget(db, {
      name: 'Food',
      period: '2025-02',
      limit: 10_000_00,
      recurring: true,
      categoryIds: [food],
    });
    ensureRecurringBudgets(db, '2025-03');
    deleteBudget(db, listBudgets(db, '2025-03')[0]!.id);
    expect(listBudgets(db, '2025-02')).toHaveLength(1);
    expect(ensureRecurringBudgets(db, '2025-04')).toBe(0);
    deleteBudget(db, 'missing');
  });

  it('fires each budget alert once per month', () => {
    createBudget(db, {
      name: 'Food',
      period: '2025-03',
      limit: 1_000_00,
      recurring: true,
      categoryIds: [food],
    });
    const spend = (amount: number) =>
      createTransaction(db, {
        type: 'expense',
        amount,
        day: '2025-03-10',
        accountId: bank,
        categoryId: food,
      });
    spend(700_00);
    expect(takeBudgetAlerts(db, '2025-03', '2025-03-10')).toEqual([]);
    spend(150_00);
    expect(takeBudgetAlerts(db, '2025-03', '2025-03-10').map((a) => a.level)).toEqual(['warning']);
    expect(takeBudgetAlerts(db, '2025-03', '2025-03-10')).toEqual([]);
    spend(200_00);
    expect(takeBudgetAlerts(db, '2025-03', '2025-03-10').map((a) => a.level)).toEqual(['over']);
    spend(20_00);
    expect(takeBudgetAlerts(db, '2025-03', '2025-03-10')).toEqual([]);
    spend(40_00);
    expect(takeBudgetAlerts(db, '2025-03', '2025-03-10').map((a) => a.level)).toEqual([
      'further_over',
    ]);
    expect(firedAlertKeys(db, 'budget:').size).toBe(3);
  });
});

describe('recurring rules', () => {
  const sip = (): RecurringInput => ({
    name: 'Index SIP',
    type: 'transfer',
    amount: 5_000_00,
    accountId: bank,
    toAccountId: fund,
    categoryId: food,
    method: 'upi',
    frequency: 'monthly',
    interval: 1,
    nextDate: '2025-01-31',
    endDate: null,
    mode: 'auto',
    note: null,
  });

  it('auto-creates every missed occurrence and moves the rule on', () => {
    const rule = createRecurringRule(db, sip());
    expect(rule).toMatchObject({ anchorDay: 31, categoryId: null, method: null });
    const created = processRecurring(db, '2025-03-15');
    expect(created.map((t) => t.day)).toEqual(['2025-01-31', '2025-02-28']);
    expect(created[0]).toMatchObject({
      source: 'recurring',
      recurringRuleId: rule.id,
      type: 'transfer',
      payee: 'Index SIP',
    });
    expect(getRecurringRule(db, rule.id)?.nextDate).toBe('2025-03-31');
    expect(processRecurring(db, '2025-03-15')).toEqual([]);
    // An SIP is a transfer: the money is saved, not spent.
    expect(getBalances(db).get(fund)).toBe(10_000_00);
    expect(loadPeriodView(db, '2025-02', settings, '2025-03-15').summary).toMatchObject({
      spending: 0,
      saved: 5_000_00,
    });
  });

  it('leaves remind-only rules due until recorded or skipped', () => {
    const rule = createRecurringRule(db, {
      ...sip(),
      type: 'expense',
      toAccountId: null,
      mode: 'remind',
      name: 'Rent',
      nextDate: '2025-03-01',
    });
    expect(processRecurring(db, '2025-03-15')).toEqual([]);
    const tx = recordOccurrence(db, rule.id, '2025-03-15')!;
    expect(tx).toMatchObject({ day: '2025-03-01', status: 'cleared', categoryId: food });
    expect(getRecurringRule(db, rule.id)?.nextDate).toBe('2025-04-01');
    skipOccurrence(db, rule.id);
    expect(getRecurringRule(db, rule.id)?.nextDate).toBe('2025-05-01');
    expect(listTransactions(db)).toHaveLength(1);
    // Recorded early: booked today, not as a future plan.
    expect(recordOccurrence(db, rule.id, '2025-04-20')).toMatchObject({
      day: '2025-04-20',
      status: 'cleared',
    });
    expect(recordOccurrence(db, 'missing', '2025-04-20')).toBeNull();
    skipOccurrence(db, 'missing');
  });

  it('ends at the end date, pauses, updates and deletes', () => {
    const rule = createRecurringRule(db, {
      ...sip(),
      nextDate: '2025-01-05',
      endDate: '2025-02-10',
    });
    processRecurring(db, '2025-06-01');
    expect(getRecurringRule(db, rule.id)).toMatchObject({ active: false, nextDate: '2025-03-05' });
    expect(listTransactions(db)).toHaveLength(2);
    setRecurringActive(db, rule.id, true);
    updateRecurringRule(db, rule.id, {
      ...sip(),
      frequency: 'weekly',
      nextDate: '2025-06-02',
      amount: 100_00,
    });
    expect(getRecurringRule(db, rule.id)).toMatchObject({
      frequency: 'weekly',
      anchorDay: null,
      amount: 100_00,
    });
    expect(listRecurringRules(db)).toHaveLength(1);
    deleteRecurringRule(db, rule.id);
    expect(listRecurringRules(db)).toEqual([]);
  });

  it('pauses a rule that can no longer be saved instead of failing', () => {
    const rule = createRecurringRule(db, { ...sip(), toAccountId: bank });
    expect(processRecurring(db, '2025-03-15')).toEqual([]);
    expect(getRecurringRule(db, rule.id)?.active).toBe(false);
  });
});

describe('maintenance, reconciliation and wipe', () => {
  it('runs start-up housekeeping', () => {
    createBudget(db, {
      name: 'Food',
      period: '2025-02',
      limit: 10_000_00,
      recurring: true,
      categoryIds: [food],
    });
    createTransaction(db, {
      type: 'expense',
      amount: 5_00,
      day: '2025-03-10',
      accountId: bank,
      status: 'scheduled',
    });
    runMaintenance(db, '2025-03-10', 1234);
    expect(getSettings(db).installedAt).toBe(1234);
    expect(listBudgets(db, '2025-03')).toHaveLength(1);
    expect(listTransactions(db)[0]?.status).toBe('cleared');
  });

  it('records a balance check and its adjustment', () => {
    const result = reconcile({ type: 'bank' }, 100_000_00, 99_000_00);
    const adjustment = recordReconciliation(db, bank, result, '2025-03-10', {
      adjust: true,
      categoryId: food,
    });
    expect(adjustment).toMatchObject({ type: 'adjustment', amount: -1_000_00, payee: 'Unmatched' });
    expect(lastReconciliation(db, bank)).toMatchObject({
      statedBalance: 99_000_00,
      adjustmentTransactionId: adjustment!.id,
    });
    expect(
      recordReconciliation(db, bank, result, '2025-03-11', { adjust: false, categoryId: null }),
    ).toBeNull();
    expect(loadPeriodView(db, '2025-03', settings, '2025-03-10').summary.spending).toBe(1_000_00);
    expect(lastReconciliation(db, fund)).toBeNull();
  });

  it('builds the accounts view and wipes everything', () => {
    const card = createAccount(db, {
      name: 'Card',
      type: 'credit_card',
      openingBalance: -500_00,
      openingDate: '2025-01-01',
      currency: 'INR',
      statementDay: 5,
      dueDay: 25,
    });
    const view = loadAccountsView(db, '2025-03-10');
    expect(view.cards.get(card.id)?.outstanding).toBe(500_00);
    expect(view.totals.netWorth).toBe(100_000_00 - 500_00);
    wipeAllData(db);
    expect(loadAccountsView(db, '2025-03-10').accounts).toEqual([]);
    expect(getSettings(db).onboarded).toBe(false);
  });
});
