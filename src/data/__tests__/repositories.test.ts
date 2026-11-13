import { createTestDb } from '../../../test/db';
import { computeBalances } from '@/domain/balances';
import type { Db } from '@/db/types';

import {
  AccountInUseError,
  accountUsage,
  createAccount,
  deleteAccount,
  getAccount,
  getBalances,
  listAccounts,
  listCardStatements,
  saveCardStatement,
  setAccountArchived,
  updateAccount,
} from '../accounts';
import { batch, getVersion, subscribe } from '../bus';
import {
  createCategory,
  listCategories,
  removeCategory,
  seedDefaultCategories,
  updateCategory,
} from '../categories';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../settings';
import {
  clearDueScheduled,
  countTransactions,
  createTransaction,
  createTransactions,
  deleteTransaction,
  getTransaction,
  InvalidTransactionError,
  isFilterActive,
  lastUsedAccountId,
  listAllTransactions,
  listEntries,
  listEntriesForAccount,
  listScheduled,
  listTransactions,
  mostUsedCategoryIds,
  restoreTransaction,
  updateTransaction,
} from '../transactions';

let db: Db;
let bank: string;
let card: string;
let fund: string;

beforeEach(() => {
  db = createTestDb().db;
  bank = createAccount(db, {
    name: 'Bank',
    type: 'bank',
    openingBalance: 10_000_00,
    openingDate: '2025-01-01',
    currency: 'INR',
  }).id;
  card = createAccount(db, {
    name: 'Card',
    type: 'credit_card',
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
    creditLimit: 50_000_00,
    statementDay: 5,
    dueDay: 25,
    last4: 'XX-1234',
  }).id;
  fund = createAccount(db, {
    name: 'Fund',
    type: 'investment',
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
  }).id;
});

describe('settings', () => {
  it('returns defaults, then saved values', () => {
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
    updateSettings(db, { currency: 'USD', monthStartDay: 30, onboarded: true });
    updateSettings(db, { currency: 'EUR' });
    expect(getSettings(db)).toMatchObject({ currency: 'EUR', monthStartDay: 30, onboarded: true });
  });
});

describe('accounts', () => {
  it('stores card details only for cards and cleans the last 4 digits', () => {
    expect(getAccount(db, card)).toMatchObject({
      statementDay: 5,
      dueDay: 25,
      last4: '1234',
      creditLimit: 50_000_00,
    });
    updateAccount(db, bank, { statementDay: 9, creditLimit: 5, name: ' Main ' });
    expect(getAccount(db, bank)).toMatchObject({
      statementDay: null,
      creditLimit: null,
      name: 'Main',
    });
    updateAccount(db, card, { statementDay: 40 });
    expect(getAccount(db, card)?.statementDay).toBeNull();
  });

  it('computes balances in SQL exactly as the domain function does', () => {
    createTransactions(db, [
      { type: 'expense', amount: 400_00, day: '2025-03-02', accountId: bank },
      { type: 'expense', amount: 2_500_00, day: '2025-03-10', accountId: card },
      {
        type: 'card_payment',
        amount: 1_000_00,
        day: '2025-03-20',
        accountId: bank,
        toAccountId: card,
      },
      { type: 'transfer', amount: 3_000_00, day: '2025-03-05', accountId: bank, toAccountId: fund },
      { type: 'income', amount: 9_000_00, day: '2025-03-01', accountId: bank },
      { type: 'refund', amount: 100_00, day: '2025-03-12', accountId: card },
      { type: 'adjustment', amount: -50_00, day: '2025-03-15', accountId: bank },
      { type: 'expense', amount: 999_00, day: '2025-03-16', accountId: bank, status: 'scheduled' },
      { type: 'expense', amount: 111_00, day: '2024-12-31', accountId: bank },
    ]);
    const accounts = listAccounts(db);
    const entries = listEntries(db, '2000-01-01', '2100-01-01');
    expect(getBalances(db)).toEqual(computeBalances(accounts, entries));
    expect(getBalances(db).get(bank)).toBe(
      10_000_00 - 400_00 - 1_000_00 - 3_000_00 + 9_000_00 - 50_00,
    );
    expect(getBalances(db).get(card)).toBe(-1_400_00);
    expect(getBalances(db, '2025-03-09')).toEqual(
      computeBalances(accounts, entries, { asOf: '2025-03-09' }),
    );
    expect(listEntriesForAccount(db, card)).toHaveLength(3);
  });

  it('blocks deleting an account with transactions and allows archiving instead', () => {
    createTransaction(db, { type: 'expense', amount: 1_00, day: '2025-03-02', accountId: bank });
    expect(accountUsage(db, bank).transactions).toBe(1);
    expect(() => deleteAccount(db, bank)).toThrow(AccountInUseError);
    setAccountArchived(db, bank, true);
    expect(listAccounts(db).map((a) => a.id)).not.toContain(bank);
    expect(listAccounts(db, { includeArchived: true })).toHaveLength(3);
    deleteAccount(db, fund);
    expect(getAccount(db, fund)).toBeNull();
  });

  it('counts the destination side as usage too', () => {
    createTransaction(db, {
      type: 'transfer',
      amount: 1_00,
      day: '2025-03-02',
      accountId: bank,
      toAccountId: fund,
    });
    expect(() => deleteAccount(db, fund)).toThrow(AccountInUseError);
  });

  it('saves statement figures once per statement date', () => {
    saveCardStatement(db, {
      accountId: card,
      statementDate: '2025-03-05',
      minimumDue: 200_00,
      statedTotal: null,
    });
    saveCardStatement(db, {
      accountId: card,
      statementDate: '2025-03-05',
      minimumDue: 250_00,
      statedTotal: 4_000_00,
    });
    expect(listCardStatements(db, card)).toMatchObject([
      { minimumDue: 250_00, statedTotal: 4_000_00 },
    ]);
    expect(listCardStatements(db)).toHaveLength(1);
  });
});

describe('categories', () => {
  it('seeds the default set once, in the chosen language', () => {
    expect(seedDefaultCategories(db, 'hi')).toBe(21);
    expect(seedDefaultCategories(db, 'en')).toBe(0);
    const all = listCategories(db);
    expect(all.filter((c) => c.kind === 'expense')).toHaveLength(16);
    expect(all.find((c) => c.systemKey === 'groceries')?.name).toBe('किराना');
  });

  it('allows one level of subcategories', () => {
    const food = createCategory(db, { name: 'Food', kind: 'expense' });
    const dining = createCategory(db, { name: 'Dining', kind: 'income', parentId: food.id });
    const nested = createCategory(db, { name: 'Cafes', kind: 'expense', parentId: dining.id });
    expect(dining).toMatchObject({ parentId: food.id, kind: 'expense' });
    expect(nested.parentId).toBeNull();
  });

  it('archives a used category and deletes an unused one', () => {
    const used = createCategory(db, { name: 'Used', kind: 'expense' });
    const unused = createCategory(db, { name: 'Unused', kind: 'expense' });
    createTransaction(db, {
      type: 'expense',
      amount: 1_00,
      day: '2025-03-02',
      accountId: bank,
      categoryId: used.id,
    });
    expect(removeCategory(db, used.id)).toBe('archived');
    expect(removeCategory(db, unused.id)).toBe('deleted');
    expect(listCategories(db)).toHaveLength(0);
    expect(listCategories(db, { includeArchived: true })).toHaveLength(1);
    updateCategory(db, used.id, { archived: false, name: ' Renamed ' });
    expect(listCategories(db)[0]?.name).toBe('Renamed');
  });
});

describe('transactions', () => {
  it('rejects invalid entries', () => {
    const bad = [
      { type: 'expense' as const, amount: 0, day: '2025-03-02', accountId: bank },
      { type: 'expense' as const, amount: -5, day: '2025-03-02', accountId: bank },
      { type: 'expense' as const, amount: 1.5, day: '2025-03-02', accountId: bank },
      { type: 'expense' as const, amount: 5, day: '2025-02-30', accountId: bank },
      { type: 'expense' as const, amount: 5, day: '2025-03-02', accountId: 'nope' },
      { type: 'transfer' as const, amount: 5, day: '2025-03-02', accountId: bank },
      {
        type: 'transfer' as const,
        amount: 5,
        day: '2025-03-02',
        accountId: bank,
        toAccountId: bank,
      },
      {
        type: 'card_payment' as const,
        amount: 5,
        day: '2025-03-02',
        accountId: bank,
        toAccountId: fund,
      },
      {
        type: 'card_payment' as const,
        amount: 5,
        day: '2025-03-02',
        accountId: card,
        toAccountId: card,
      },
    ];
    for (const input of bad) {
      expect(() => createTransaction(db, input)).toThrow(InvalidTransactionError);
    }
    expect(countTransactions(db)).toBe(0);
  });

  it('turns a transfer to a credit card into a bill payment', () => {
    const tx = createTransaction(db, {
      type: 'transfer',
      amount: 500_00,
      day: '2025-03-02',
      accountId: bank,
      toAccountId: card,
      categoryId: null,
    });
    expect(tx.type).toBe('card_payment');
  });

  it('drops the destination and keeps the category on ordinary entries', () => {
    const food = createCategory(db, { name: 'Food', kind: 'expense' });
    const tx = createTransaction(db, {
      type: 'expense',
      amount: 5_00,
      day: '2025-03-02',
      accountId: bank,
      toAccountId: fund,
      categoryId: food.id,
      payee: '  Cafe ',
      note: ' ',
      tags: [' a ', ''],
    });
    expect(tx).toMatchObject({
      toAccountId: null,
      categoryId: food.id,
      payee: 'Cafe',
      note: null,
      tags: ['a'],
    });
    const moved = createTransaction(db, {
      type: 'transfer',
      amount: 5_00,
      day: '2025-03-02',
      accountId: bank,
      toAccountId: fund,
      categoryId: food.id,
    });
    expect(moved.categoryId).toBeNull();
  });

  it('allows a signed adjustment', () => {
    expect(
      createTransaction(db, {
        type: 'adjustment',
        amount: -75_00,
        day: '2025-03-02',
        accountId: bank,
      }).amount,
    ).toBe(-75_00);
  });

  it('updates, deletes and restores (undo)', () => {
    const tx = createTransaction(db, {
      type: 'expense',
      amount: 5_00,
      day: '2025-03-02',
      accountId: bank,
      source: 'voice',
    });
    const updated = updateTransaction(db, tx.id, {
      type: 'expense',
      amount: 7_00,
      day: '2025-03-03',
      accountId: bank,
    });
    expect(updated).toMatchObject({
      amount: 7_00,
      day: '2025-03-03',
      source: 'voice',
      createdAt: tx.createdAt,
    });
    const removed = deleteTransaction(db, tx.id)!;
    expect(getTransaction(db, tx.id)).toBeNull();
    restoreTransaction(db, removed);
    expect(getTransaction(db, tx.id)).toEqual(updated);
    expect(deleteTransaction(db, 'missing')).toBeNull();
    expect(() =>
      updateTransaction(db, 'missing', {
        type: 'expense',
        amount: 1,
        day: '2025-03-03',
        accountId: bank,
      }),
    ).toThrow();
  });

  it('keeps the SMS hash unique', () => {
    createTransaction(db, {
      type: 'expense',
      amount: 5_00,
      day: '2025-03-02',
      accountId: bank,
      smsHash: 'h1',
    });
    expect(() =>
      createTransaction(db, {
        type: 'expense',
        amount: 5_00,
        day: '2025-03-02',
        accountId: bank,
        smsHash: 'h1',
      }),
    ).toThrow();
  });

  describe('list, search and filters', () => {
    let food: string;
    let dining: string;
    beforeEach(() => {
      food = createCategory(db, { name: 'Food', kind: 'expense' }).id;
      dining = createCategory(db, { name: 'Dining', kind: 'expense', parentId: food }).id;
      createTransactions(db, [
        {
          type: 'expense',
          amount: 400_00,
          day: '2025-03-02',
          accountId: bank,
          categoryId: food,
          payee: 'Corner Store',
          method: 'upi',
        },
        {
          type: 'expense',
          amount: 1_250_50,
          day: '2025-03-04',
          accountId: card,
          categoryId: dining,
          payee: 'Blue Cafe',
          method: 'card',
          note: '100% tip_test',
        },
        {
          type: 'income',
          amount: 50_000_00,
          day: '2025-03-01',
          accountId: bank,
          payee: 'Employer',
          source: 'sms',
          smsHash: 's1',
        },
        {
          type: 'transfer',
          amount: 5_000_00,
          day: '2025-03-05',
          accountId: bank,
          toAccountId: fund,
          tags: ['sip'],
        },
        { type: 'expense', amount: 99_00, day: '2025-02-20', accountId: bank, method: 'cash' },
      ]);
    });

    it('lists newest first with paging', () => {
      const first = listTransactions(db, {}, { limit: 2, offset: 0 });
      const second = listTransactions(db, {}, { limit: 2, offset: 2 });
      expect(first.map((t) => t.day)).toEqual(['2025-03-05', '2025-03-04']);
      expect(second.map((t) => t.day)).toEqual(['2025-03-02', '2025-03-01']);
      expect(countTransactions(db)).toBe(5);
      expect(listAllTransactions(db)).toHaveLength(5);
    });

    it('filters by type, account, category, method, source, amount and dates', () => {
      expect(countTransactions(db, { types: ['expense'] })).toBe(3);
      expect(countTransactions(db, { accountIds: [fund] })).toBe(1);
      expect(countTransactions(db, { categoryIds: [food] })).toBe(2);
      expect(countTransactions(db, { categoryIds: [dining] })).toBe(1);
      expect(countTransactions(db, { methods: ['upi', 'cash'] })).toBe(2);
      expect(countTransactions(db, { sources: ['sms'] })).toBe(1);
      expect(countTransactions(db, { minAmount: 1_000_00, maxAmount: 6_000_00 })).toBe(2);
      expect(countTransactions(db, { start: '2025-03-01', end: '2025-03-04' })).toBe(3);
      expect(countTransactions(db, { status: 'scheduled' })).toBe(0);
    });

    it('searches payee, note, tags, category name and amount', () => {
      expect(countTransactions(db, { search: 'cafe' })).toBe(1);
      expect(countTransactions(db, { search: 'tip_test' })).toBe(1);
      expect(countTransactions(db, { search: '100%' })).toBe(1);
      expect(countTransactions(db, { search: 'sip' })).toBe(1);
      expect(countTransactions(db, { search: 'Dining' })).toBe(1);
      expect(countTransactions(db, { search: '1250.50' })).toBe(1);
      expect(countTransactions(db, { search: '400' })).toBe(1);
      expect(countTransactions(db, { search: 'zzz' })).toBe(0);
    });

    it('knows when a filter is active', () => {
      expect(isFilterActive({})).toBe(false);
      expect(isFilterActive({ search: '  ' })).toBe(false);
      expect(isFilterActive({ types: [] })).toBe(false);
      expect(isFilterActive({ minAmount: 0 })).toBe(true);
      expect(isFilterActive({ search: 'x' })).toBe(true);
    });

    it('finds the most used categories and the last used account', () => {
      createTransaction(db, {
        type: 'expense',
        amount: 1_00,
        day: '2025-03-06',
        accountId: card,
        categoryId: dining,
      });
      expect(mostUsedCategoryIds(db, '2025-03-01')).toEqual([dining, food]);
      expect(lastUsedAccountId(db)).toBe(card);
      expect(lastUsedAccountId(db, 'refund')).toBeNull();
    });
  });

  it('clears scheduled entries when their day arrives', () => {
    createTransaction(db, {
      type: 'expense',
      amount: 5_00,
      day: '2025-03-10',
      accountId: bank,
      status: 'scheduled',
    });
    createTransaction(db, {
      type: 'expense',
      amount: 6_00,
      day: '2025-03-20',
      accountId: bank,
      status: 'scheduled',
    });
    expect(listScheduled(db)).toHaveLength(2);
    expect(clearDueScheduled(db, '2025-03-09')).toBe(0);
    expect(clearDueScheduled(db, '2025-03-10')).toBe(1);
    expect(listScheduled(db).map((t) => t.day)).toEqual(['2025-03-20']);
    expect(getBalances(db).get(bank)).toBe(10_000_00 - 5_00);
  });
});

describe('change bus', () => {
  it('notifies listeners on every write and once per batch', () => {
    const seen: number[] = [];
    const stop = subscribe(() => seen.push(getVersion()));
    createTransaction(db, { type: 'expense', amount: 5_00, day: '2025-03-10', accountId: bank });
    expect(seen).toHaveLength(1);
    batch(() => {
      createTransaction(db, { type: 'expense', amount: 5_00, day: '2025-03-10', accountId: bank });
      createTransaction(db, { type: 'expense', amount: 5_00, day: '2025-03-10', accountId: bank });
    });
    expect(seen).toHaveLength(2);
    stop();
    createTransaction(db, { type: 'expense', amount: 5_00, day: '2025-03-10', accountId: bank });
    expect(seen).toHaveLength(2);
  });
});
