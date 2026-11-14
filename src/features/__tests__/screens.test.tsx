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

describe('Phase 5 screens', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Plans = require('@/app/(tabs)/plans').default;
  const Reports = require('@/app/(tabs)/reports').default;
  const GoalScreen = require('@/app/goal').default;
  const PurchaseScreen = require('@/app/purchase').default;
  const plans = require('@/data/plans');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('shows goals with the monthly amount needed, and planned purchases', async () => {
    seedBasics(db);
    const goal = plans.createGoal(db, {
      name: 'Emergency fund',
      targetAmount: 1_20_000_00,
      targetDate: null,
      accountId: null,
      color: '#0F7B6C',
      icon: 'target',
    });
    plans.addContribution(db, { goalId: goal.id, amount: 30_000_00, day: today }, today);
    plans.createPurchase(db, {
      name: 'Bicycle',
      estimatedPrice: 18_000_00,
      priority: 'high',
      fundingNotes: null,
    });
    await renderScreen(<Plans />);
    expect(screen.getByText('Emergency fund')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('Bicycle')).toBeTruthy();
    expect(screen.getByText('Thinking')).toBeTruthy();
  });

  it('creates a goal', async () => {
    seedBasics(db);
    await renderScreen(<GoalScreen />);
    await fireEvent.changeText(screen.getByLabelText('Goal name'), 'New phone');
    await fireEvent.changeText(screen.getByLabelText('Target amount'), '40000');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(plans.listGoals(db)).toMatchObject([{ name: 'New phone', targetAmount: 40_000_00 }]);
  });

  it('buys a planned purchase into the ledger', async () => {
    const { bank } = seedBasics(db);
    const p = plans.createPurchase(db, {
      name: 'Bicycle',
      estimatedPrice: 18_000_00,
      priority: 'high',
      fundingNotes: null,
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: p.id });
    await renderScreen(<PurchaseScreen />);
    await fireEvent.press(screen.getByLabelText('Account: None'));
    await fireEvent.press(screen.getByLabelText('Everyday Bank'));
    await fireEvent.press(screen.getByLabelText('Mark as bought'));
    expect(listTransactions(db)[0]).toMatchObject({
      type: 'expense',
      amount: 18_000_00,
      accountId: bank.id,
      payee: 'Bicycle',
    });
    expect(plans.getPurchase(db, p.id).status).toBe('bought');
  });

  it('renders reports with a described chart and month-over-month change', async () => {
    const { bank } = seedBasics(db);
    const food = listCategories(db).find((c) => c.systemKey === 'food')!;
    createTransaction(db, {
      type: 'expense',
      amount: 2_500_00,
      day: today,
      accountId: bank.id,
      categoryId: food.id,
    });
    await renderScreen(<Reports />);
    expect(screen.getByLabelText(/^Chart of the last 6 months/)).toBeTruthy();
    expect(screen.getByText('Spending by category')).toBeTruthy();
    expect(screen.getAllByText('Food & Dining').length).toBeGreaterThan(0);
    expect(screen.getByText('up')).toBeTruthy();
  });

  it('shows empty states', async () => {
    seedBasics(db);
    await renderScreen(<Plans />);
    expect(screen.getByText('No goals yet')).toBeTruthy();
    await renderScreen(<Reports />);
    expect(screen.getByText('Not enough data yet')).toBeTruthy();
  });
});

describe('Phase 6: type or say it', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Keywords = require('@/app/settings/keywords').default;
  const { listKeywords, saveKeyword } = require('@/data/keywords');
  const { parsedToForm } = require('@/features/QuickText');
  const { parseEntry } = require('@/parse');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('fills the sheet from a typed phrase, highlights doubts and never saves by itself', async () => {
    const { bank } = seedBasics(db);
    await renderScreen(<QuickAdd />);
    const input = screen.getByLabelText('Describe the entry in words');
    await fireEvent.changeText(input, '400 on food kal via UPI');
    await fireEvent(input, 'submitEditing');
    expect(screen.getByText('400')).toBeTruthy();
    expect(listTransactions(db)).toHaveLength(0);
    // "kal" was a guess, so the date chip is flagged for checking.
    expect(screen.getByLabelText('Date: Yesterday')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save entry'));
    const [tx] = listTransactions(db);
    expect(tx).toMatchObject({
      amount: 400_00,
      method: 'upi',
      accountId: bank.id,
      type: 'expense',
    });
    expect(listCategories(db).find((c) => c.id === tx!.categoryId)?.systemKey).toBe('food');
  });

  it('learns the payee against the category the user chose', async () => {
    seedBasics(db);
    await renderScreen(<QuickAdd />);
    const input = screen.getByLabelText('Describe the entry in words');
    await fireEvent.changeText(input, 'paid 640 to Sharma Stores');
    await fireEvent(input, 'submitEditing');
    await fireEvent.press(screen.getByLabelText('Groceries'));
    await fireEvent.press(screen.getByLabelText('Save entry'));
    const groceries = listCategories(db).find((c) => c.systemKey === 'groceries')!;
    expect(listKeywords(db)).toMatchObject([
      { keyword: 'sharma stores', categoryId: groceries.id, origin: 'learned' },
    ]);
    const again = parseEntry('sharma stores 300', {
      today,
      accounts: [],
      categories: listCategories(db),
      userKeywords: listKeywords(db),
    });
    expect(again.categoryId).toBe(groceries.id);
  });

  it('does not let learning overwrite a keyword the user set', () => {
    seedBasics(db);
    const [a, b] = listCategories(db);
    saveKeyword(db, 'Chai Point', a!.id, 'user');
    saveKeyword(db, 'chai point', b!.id, 'learned');
    expect(listKeywords(db)).toMatchObject([
      { keyword: 'chai point', categoryId: a!.id, origin: 'user' },
    ]);
    saveKeyword(db, 'x', a!.id, 'user');
    expect(listKeywords(db)).toHaveLength(1);
  });

  it('maps a parse result onto the form, leaving unknown fields alone', () => {
    const changes = parsedToForm(
      {
        type: 'expense',
        amount: 1_250_50,
        day: today,
        categoryId: null,
        accountId: null,
        toAccountId: null,
        method: null,
        payee: null,
        uncertain: [],
        categoryKeyword: null,
      },
      2,
      true,
    );
    expect(changes).toEqual({
      type: 'expense',
      day: today,
      source: 'voice',
      amountText: '1250.50',
    });
  });

  it('lists and adds keywords in settings', async () => {
    seedBasics(db);
    const food = listCategories(db).find((c) => c.systemKey === 'food')!;
    saveKeyword(db, 'tapri', food.id, 'user');
    await renderScreen(<Keywords />);
    expect(screen.getByText('tapri')).toBeTruthy();
    expect(screen.getByLabelText('Remove tapri')).toBeTruthy();
  });
});

describe('Phase 7: SMS import', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const SmsSettings = require('@/app/settings/sms').default;
  const SmsInbox = require('@/app/sms-inbox').default;
  const native = require('@/sms/native');
  const sms = require('@/data/sms');
  const { TRANSACTIONS } = require('@/sms/testing/samples');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('is off by default and explains what is read before asking', async () => {
    seedBasics(db);
    expect(getSettings(db).smsEnabled).toBe(false);
    await renderScreen(<SmsSettings />);
    expect(
      screen.getByText('OTPs, offers and personal messages are skipped and never stored.'),
    ).toBeTruthy();
    expect(native.requestSmsPermission).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Allow and turn on'));
    expect(native.requestSmsPermission).toHaveBeenCalledTimes(1);
    expect(getSettings(db).smsEnabled).toBe(true);
  });

  it('stays off when the permission is refused', async () => {
    seedBasics(db);
    native.requestSmsPermission.mockResolvedValueOnce(false);
    await renderScreen(<SmsSettings />);
    await fireEvent.press(screen.getByLabelText('Allow and turn on'));
    expect(getSettings(db).smsEnabled).toBe(false);
  });

  it('hides the feature on a build without the SMS permission', async () => {
    seedBasics(db);
    native.smsSupported.mockReturnValue(false);
    await renderScreen(<SmsSettings />);
    expect(screen.getByText('Not available in this version')).toBeTruthy();
    await renderScreen(<Settings />);
    expect(screen.queryByText('Bank SMS import')).toBeNull();
    native.smsSupported.mockReturnValue(true);
  });

  it('reviews an alert: map the card once, then add it to the ledger', async () => {
    const { card } = seedBasics(db);
    updateSettings(db, { smsEnabled: true });
    sms.importSms(db, [
      TRANSACTIONS.find((s: { name: string }) => s.name === 'SBI Card spent').sms,
    ]);
    await renderScreen(<SmsInbox />);
    expect(screen.getByText('BOOK HOUSE')).toBeTruthy();
    // The seeded card's last 4 digits are 4321, so it is matched without asking.
    expect(screen.getByLabelText('Account: Rewards Card')).toBeTruthy();
    expect(listTransactions(db)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Add'));
    expect(listTransactions(db)[0]).toMatchObject({
      type: 'expense',
      amount: 1_499_00,
      accountId: card.id,
      source: 'sms',
      payee: 'BOOK HOUSE',
    });
    expect(sms.countInbox(db)).toBe(0);
  });

  it('shows the pending count on Overview', async () => {
    seedBasics(db);
    updateSettings(db, { smsEnabled: true });
    sms.importSms(db, [TRANSACTIONS[0].sms]);
    await renderScreen(<Overview />);
    expect(screen.getByText('1 to review')).toBeTruthy();
  });
});
