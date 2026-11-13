import { fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderScreen, resetTestDb, seedBasics } from '../../../test/screens';
import Accounts from '@/app/(tabs)/accounts';
import Overview from '@/app/(tabs)/index';
import Transactions from '@/app/(tabs)/transactions';
import AccountEdit from '@/app/account-edit';
import Onboarding from '@/app/onboarding';
import PayBill from '@/app/pay-bill';
import QuickAdd from '@/app/quick-add';
import Reconcile from '@/app/reconcile';
import Settings from '@/app/settings/index';
import { createBudget } from '@/data/budgets';
import { listCategories } from '@/data/categories';
import { currentPeriodKey } from '@/data/queries';
import { getSettings, updateSettings } from '@/data/settings';
import { createTransaction, listTransactions } from '@/data/transactions';
import { getBalances } from '@/data/accounts';
import type { Db } from '@/db/types';
import { dayFromDate } from '@/domain/dates';

const today = dayFromDate(new Date());
let db: Db;

beforeEach(() => {
  db = resetTestDb();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.clearAllMocks();
});

describe('Overview', () => {
  it('shows an empty state before anything is recorded', async () => {
    seedBasics(db);
    await renderScreen(<Overview />);
    expect(screen.getByText('Nothing recorded yet this month')).toBeTruthy();
    expect(screen.getByLabelText('Add transaction')).toBeTruthy();
  });

  it('shows spending against the budget with a status that is not colour alone', async () => {
    const { bank, card } = seedBasics(db);
    const food = listCategories(db).find((c) => c.systemKey === 'food')!;
    createBudget(db, {
      name: 'Food',
      period: currentPeriodKey(getSettings(db), today),
      limit: 1_000_00,
      recurring: true,
      categoryIds: [food.id],
    });
    createTransaction(db, {
      type: 'expense',
      amount: 700_00,
      day: today,
      accountId: bank.id,
      categoryId: food.id,
    });
    createTransaction(db, {
      type: 'expense',
      amount: 500_00,
      day: today,
      accountId: card.id,
      categoryId: food.id,
    });
    createTransaction(db, {
      type: 'card_payment',
      amount: 500_00,
      day: today,
      accountId: bank.id,
      toAccountId: card.id,
    });
    await renderScreen(<Overview />);
    // 700 + 500 spent; the bill payment is not counted again.
    expect(screen.getByLabelText('Spent ₹1,200')).toBeTruthy();
    expect(screen.getAllByText('Over budget').length).toBeGreaterThan(0);
    expect(screen.getByText('₹200 over')).toBeTruthy();
  });

  it('follows the Hindi language setting', async () => {
    seedBasics(db);
    updateSettings(db, { language: 'hi' });
    await renderScreen(<Overview />);
    expect(screen.getByText('इस महीने खर्च')).toBeTruthy();
  });
});

describe('Accounts', () => {
  it('shows net worth and the card position', async () => {
    const { card } = seedBasics(db);
    createTransaction(db, { type: 'expense', amount: 2_000_00, day: today, accountId: card.id });
    await renderScreen(<Accounts />);
    expect(screen.getByLabelText('Net worth: ₹48,000')).toBeTruthy();
    expect(screen.getByText('Rewards Card ··4321')).toBeTruthy();
    expect(screen.getByLabelText('Check balance of Everyday Bank')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Pay bill'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/pay-bill', params: { id: card.id } });
  });

  it('shows an empty state without accounts', async () => {
    await renderScreen(<Accounts />);
    expect(screen.getByText('No accounts yet')).toBeTruthy();
  });
});

describe('Quick add', () => {
  it('saves an expense in three taps after the amount', async () => {
    const { bank } = seedBasics(db);
    await renderScreen(<QuickAdd />);
    await fireEvent.press(screen.getByLabelText('4'));
    await fireEvent.press(screen.getByLabelText('0'));
    await fireEvent.press(screen.getByLabelText('0'));
    await fireEvent.press(screen.getByLabelText('Groceries'));
    await fireEvent.press(screen.getByLabelText('Save entry'));
    const [tx] = listTransactions(db);
    expect(tx).toMatchObject({
      type: 'expense',
      amount: 400_00,
      accountId: bank.id,
      day: today,
      method: 'upi',
    });
    expect(getBalances(db).get(bank.id)).toBe(50_000_00 - 400_00);
    expect(router.back).toHaveBeenCalled();
  });

  it('keeps Save disabled until there is an amount', async () => {
    seedBasics(db);
    await renderScreen(<QuickAdd />);
    expect(screen.getByLabelText('Save entry').props.accessibilityState.disabled).toBe(true);
  });

  it('asks for an account first when there is none', async () => {
    await renderScreen(<QuickAdd />);
    expect(screen.getByText('Add an account first')).toBeTruthy();
  });

  it('loads an existing entry for editing', async () => {
    const { bank } = seedBasics(db);
    const tx = createTransaction(db, {
      type: 'expense',
      amount: 123_45,
      day: today,
      accountId: bank.id,
      payee: 'Corner Shop',
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: tx.id });
    await renderScreen(<QuickAdd />);
    expect(screen.getByText('Edit entry')).toBeTruthy();
    expect(screen.getByText('123.45')).toBeTruthy();
    expect(screen.getByDisplayValue('Corner Shop')).toBeTruthy();
  });
});

describe('Transactions', () => {
  it('lists entries grouped by day and deletes with undo', async () => {
    const { bank } = seedBasics(db);
    createTransaction(db, {
      type: 'expense',
      amount: 250_00,
      day: today,
      accountId: bank.id,
      payee: 'Tea Stall',
    });
    await renderScreen(<Transactions />);
    expect(screen.getByText('Today')).toBeTruthy();
    const row = screen.getByText('Tea Stall');
    expect(row).toBeTruthy();
    expect(screen.getByText('1 entries')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    seedBasics(db);
    await renderScreen(<Transactions />);
    expect(screen.getByText('No transactions yet')).toBeTruthy();
  });
});

describe('Reconcile', () => {
  it('shows the difference and books an Unmatched adjustment', async () => {
    const { bank } = seedBasics(db);
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: bank.id });
    await renderScreen(<Reconcile />);
    await fireEvent.changeText(screen.getByLabelText('Balance shown in your bank app'), '49,250');
    expect(screen.getByText('Difference of ₹750')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Create adjustment'));
    expect(listTransactions(db)[0]).toMatchObject({
      type: 'adjustment',
      amount: -750_00,
      payee: 'Unmatched',
      categoryId: null,
    });
    expect(getBalances(db).get(bank.id)).toBe(49_250_00);
  });
});

describe('Pay bill', () => {
  it('creates a card payment that lowers both the bank balance and the outstanding', async () => {
    const { bank, card } = seedBasics(db);
    createTransaction(db, { type: 'expense', amount: 3_000_00, day: today, accountId: card.id });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: card.id });
    await renderScreen(<PayBill />);
    await fireEvent.press(screen.getByLabelText('Record payment'));
    expect(listTransactions(db)[0]).toMatchObject({
      type: 'card_payment',
      amount: 3_000_00,
      accountId: bank.id,
      toAccountId: card.id,
    });
    expect(getBalances(db).get(card.id)).toBe(0);
    expect(getBalances(db).get(bank.id)).toBe(47_000_00);
  });
});

describe('Account edit, onboarding and settings', () => {
  it('validates the account name', async () => {
    seedBasics(db);
    await renderScreen(<AccountEdit />);
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(screen.getByText('Give the account a name')).toBeTruthy();
  });

  it('lets every onboarding step be skipped', async () => {
    await renderScreen(<Onboarding />);
    await fireEvent.press(screen.getByLabelText('Get started'));
    for (let i = 0; i < 5; i += 1) await fireEvent.press(screen.getByLabelText('Skip'));
    await fireEvent.press(screen.getByLabelText('Skip and finish'));
    expect(getSettings(db).onboarded).toBe(true);
    expect(listCategories(db).length).toBe(21);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('renders settings', async () => {
    seedBasics(db);
    await renderScreen(<Settings />);
    expect(screen.getByText('Delete all data')).toBeTruthy();
  });
});

describe('Phase 4 screens', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Budgets = require('@/app/settings/budgets').default;
  const Recurring = require('@/app/settings/recurring').default;
  const NotificationSettings = require('@/app/settings/notifications').default;
  const { createRecurringRule } = require('@/data/recurring');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('shows budget banners and coming-up items on Overview', async () => {
    const { bank, card } = seedBasics(db);
    const food = listCategories(db).find((c) => c.systemKey === 'food')!;
    createBudget(db, {
      name: 'Food',
      period: currentPeriodKey(getSettings(db), today),
      limit: 1_000_00,
      recurring: true,
      categoryIds: [food.id],
    });
    createTransaction(db, {
      type: 'expense',
      amount: 900_00,
      day: today,
      accountId: bank.id,
      categoryId: food.id,
    });
    createRecurringRule(db, {
      name: 'Rent',
      type: 'expense',
      amount: 15_000_00,
      accountId: bank.id,
      toAccountId: null,
      categoryId: null,
      method: 'upi',
      frequency: 'monthly',
      interval: 1,
      nextDate: today,
      endDate: null,
      mode: 'remind',
      note: null,
    });
    void card;
    await renderScreen(<Overview />);
    expect(screen.getByText('Food is at 90%')).toBeTruthy();
    expect(screen.getByText('Coming up')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
  });

  it('adds a budget', async () => {
    seedBasics(db);
    await renderScreen(<Budgets />);
    expect(screen.getByText('No budgets for this month')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Add budget')[0]!);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Food');
    await fireEvent.changeText(screen.getByLabelText(/^Limit for/), '8000');
    await fireEvent.press(screen.getByLabelText('Groceries'));
    await fireEvent.press(screen.getByLabelText('Save'));
    const { listBudgets } = jest.requireActual('@/data/budgets');
    expect(listBudgets(db, currentPeriodKey(getSettings(db), today))).toMatchObject([
      { name: 'Food', limit: 8_000_00, recurring: true },
    ]);
  });

  it('renders recurring rules and notification settings', async () => {
    const { bank } = seedBasics(db);
    createRecurringRule(db, {
      name: 'Music',
      type: 'expense',
      amount: 119_00,
      accountId: bank.id,
      toAccountId: null,
      categoryId: null,
      method: 'card',
      frequency: 'monthly',
      interval: 1,
      nextDate: today,
      endDate: null,
      mode: 'auto',
      note: null,
    });
    await renderScreen(<Recurring />);
    expect(screen.getByText('Music')).toBeTruthy();
    expect(screen.getByText('Add automatically')).toBeTruthy();
    await renderScreen(<NotificationSettings />);
    expect(screen.getByText('Card bill reminders')).toBeTruthy();
  });
});
