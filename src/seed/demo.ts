/**
 * A fictional dataset for screenshots and manual testing: three months,
 * two banks, two cards, budgets, goals and recurring items. Every name and
 * number is invented. The app never ships with this data.
 */
import { createAccount } from '@/data/accounts';
import { createBudget } from '@/data/budgets';
import { batch } from '@/data/bus';
import { listCategories, seedDefaultCategories } from '@/data/categories';
import { addContribution, createGoal, createPurchase } from '@/data/plans';
import { createRecurringRule } from '@/data/recurring';
import { updateSettings } from '@/data/settings';
import { createTransaction } from '@/data/transactions';
import type { Db } from '@/db/types';
import { addDays, addMonths, startOfMonth, type Day } from '@/domain/dates';
import { periodForDay } from '@/domain/months';
import type { PaymentMethod } from '@/domain/types';

/** Small deterministic generator so the data is the same every run. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const SPEND: [string, string[], number, number, PaymentMethod][] = [
  ['food', ['Blue Cafe', 'Spice Route', 'Chai Corner', 'Dosa House'], 120, 900, 'upi'],
  ['groceries', ['Green Grocer', 'Daily Mart', 'Fresh Basket'], 200, 2400, 'upi'],
  ['transport', ['City Cab', 'Metro Card', 'Fuel Stop'], 60, 1500, 'upi'],
  ['shopping', ['Book House', 'Style Store', 'Gadget Hub'], 400, 4500, 'card'],
  ['entertainment', ['Cinema Plex', 'Game Zone'], 250, 1200, 'card'],
  ['health', ['City Pharmacy', 'Care Clinic'], 150, 1800, 'upi'],
  ['utilities', ['Power Board', 'Fibre Net', 'Mobile Plan'], 300, 1800, 'netbanking'],
];

export function seedDemo(db: Db, today: Day): void {
  batch(() => {
    updateSettings(db, { onboarded: true, currency: 'INR', grouping: 'indian' });
    seedDefaultCategories(db, 'en');
    const key = new Map(listCategories(db).map((c) => [c.systemKey ?? '', c.id]));
    const opened = addDays(startOfMonth(addMonths(today, -3)), 0);
    const base = { openingDate: opened, currency: 'INR' };
    const bankA = createAccount(db, {
      ...base,
      name: 'Everyday Bank',
      type: 'bank',
      openingBalance: 120_000_00,
      last4: '1234',
    });
    const bankB = createAccount(db, {
      ...base,
      name: 'Savings Bank',
      type: 'bank',
      openingBalance: 300_000_00,
      last4: '5678',
    });
    const cash = createAccount(db, {
      ...base,
      name: 'Wallet Cash',
      type: 'cash',
      openingBalance: 3_000_00,
    });
    const fund = createAccount(db, {
      ...base,
      name: 'Index Fund',
      type: 'investment',
      openingBalance: 150_000_00,
    });
    const cardA = createAccount(db, {
      ...base,
      name: 'Rewards Card',
      type: 'credit_card',
      openingBalance: -8_000_00,
      creditLimit: 150_000_00,
      statementDay: 5,
      dueDay: 25,
      last4: '4321',
    });
    const cardB = createAccount(db, {
      ...base,
      name: 'Travel Card',
      type: 'credit_card',
      openingBalance: 0,
      creditLimit: 80_000_00,
      statementDay: 18,
      dueDay: 8,
      last4: '8765',
    });

    const rand = rng(42);
    const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)] as T;
    for (let d = addDays(opened, 0); d <= today; d = addDays(d, 1)) {
      const day = Number(d.slice(8));
      if (day === 1) {
        createTransaction(db, {
          type: 'income',
          amount: 95_000_00,
          day: d,
          accountId: bankA.id,
          categoryId: key.get('salary'),
          payee: 'Acme Works',
          method: 'netbanking',
        });
        createTransaction(db, {
          type: 'expense',
          amount: 24_000_00,
          day: d,
          accountId: bankA.id,
          categoryId: key.get('rent'),
          payee: 'Landlord',
          method: 'netbanking',
        });
      }
      if (day === 5)
        createTransaction(db, {
          type: 'transfer',
          amount: 15_000_00,
          day: d,
          accountId: bankA.id,
          toAccountId: fund.id,
          payee: 'Index SIP',
        });
      if (day === 10)
        createTransaction(db, {
          type: 'income',
          amount: 1_850_00,
          day: d,
          accountId: bankB.id,
          categoryId: key.get('interest'),
          payee: 'Interest',
        });
      if (day === 27) {
        // Pay the Rewards Card bill from the statement before last.
        createTransaction(db, {
          type: 'card_payment',
          amount: 18_000_00,
          day: d,
          accountId: bankA.id,
          toAccountId: cardA.id,
          payee: 'Rewards Card bill',
        });
      }
      const count = rand() < 0.65 ? 1 + Math.floor(rand() * 2) : 0;
      for (let i = 0; i < count; i += 1) {
        const [cat, payees, lo, hi, method] = pick(SPEND);
        const amount = (lo + Math.floor(rand() * (hi - lo))) * 100 + Math.floor(rand() * 4) * 25;
        const onCard = method === 'card' || rand() < 0.2;
        const account = onCard
          ? rand() < 0.7
            ? cardA
            : cardB
          : method === 'upi' && rand() < 0.2
            ? cash
            : bankA;
        createTransaction(db, {
          type: 'expense',
          amount,
          day: d,
          accountId: account.id,
          categoryId: key.get(cat),
          payee: pick(payees),
          method: onCard ? 'card' : account.id === cash.id ? 'cash' : method,
        });
      }
    }
    createTransaction(db, {
      type: 'refund',
      amount: 899_00,
      day: addDays(today, -6),
      accountId: cardA.id,
      categoryId: key.get('shopping'),
      payee: 'Style Store',
    });

    const period = periodForDay(today).key;
    const budget = (name: string, limit: number, cats: string[]) =>
      createBudget(db, {
        name,
        period,
        limit: limit * 100,
        recurring: true,
        categoryIds: cats.map((c) => key.get(c)).filter((x): x is string => !!x),
      });
    budget('Home & Bills', 32_000, ['rent', 'utilities']);
    budget('Food', 14_000, ['food', 'groceries']);
    budget('Getting around', 6_000, ['transport', 'travel']);
    budget('Shopping & Fun', 9_000, ['shopping', 'entertainment']);
    budget('Health', 3_000, ['health']);

    const goal = createGoal(db, {
      name: 'Emergency fund',
      targetAmount: 3_00_000_00,
      targetDate: addMonths(today, 10),
      accountId: bankB.id,
      color: '#0F7B6C',
      icon: 'target',
    });
    addContribution(db, { goalId: goal.id, amount: 1_20_000_00, day: addDays(today, -60) }, today);
    addContribution(db, { goalId: goal.id, amount: 30_000_00, day: addDays(today, -20) }, today);
    createGoal(db, {
      name: 'Goa trip',
      targetAmount: 60_000_00,
      targetDate: addMonths(today, 4),
      accountId: null,
      color: '#E07A3F',
      icon: 'beach',
    });
    createPurchase(db, {
      name: 'Washing machine',
      estimatedPrice: 32_000_00,
      priority: 'high',
      fundingNotes: 'Next month bonus',
      status: 'saving',
    });
    createPurchase(db, {
      name: 'Noise-cancelling headphones',
      estimatedPrice: 14_000_00,
      priority: 'low',
      fundingNotes: null,
    });

    const nextOn = (dom: number): Day => {
      const first = startOfMonth(today);
      const here = `${first.slice(0, 8)}${String(dom).padStart(2, '0')}`;
      return here > today ? here : addMonths(here, 1, dom);
    };
    const rule = (
      name: string,
      amount: number,
      dom: number,
      accountId: string,
      cat: string | null,
      mode: 'auto' | 'remind',
    ) =>
      createRecurringRule(db, {
        name,
        type: 'expense',
        amount: amount * 100,
        accountId,
        toAccountId: null,
        categoryId: cat ? (key.get(cat) ?? null) : null,
        method: 'card',
        frequency: 'monthly',
        interval: 1,
        nextDate: nextOn(dom),
        endDate: null,
        mode,
        note: null,
      });
    rule('Music streaming', 119, 12, cardA.id, 'subscriptions', 'auto');
    rule('Gym', 1_500, 3, bankA.id, 'subscriptions', 'remind');
    rule('Broadband', 799, 20, bankA.id, 'utilities', 'remind');
  });
}
