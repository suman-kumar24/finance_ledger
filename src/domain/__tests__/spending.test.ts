import { account, category, entry, mapById } from '../../../test/factories';
import {
  spendingByTopCategory,
  spendingForCategories,
  summarize,
  UNCATEGORIZED,
  type SummaryContext,
} from '../spending';

const accounts = mapById([
  account('bank', 'bank'),
  account('card', 'credit_card'),
  account('fund', 'investment'),
  account('fd', 'savings'),
  account('cash', 'cash'),
]);
const categories = mapById([
  category('food'),
  category('dining', 'expense', 'food'),
  category('shopping'),
  category('salary', 'income'),
  category('refunds', 'income'),
]);
const ctx: SummaryContext = { accounts, categories };
const march = { start: '2025-03-01', end: '2025-03-31' };

describe('rule 2: card spending is counted once', () => {
  it('counts the purchase in its month and never the bill payment', () => {
    const entries = [
      entry('expense', 2_500_00, '2025-03-10', 'card', { categoryId: 'shopping' }),
      entry('card_payment', 2_500_00, '2025-04-20', 'bank', { toAccountId: 'card' }),
    ];
    expect(summarize(entries, ctx, march).spending).toBe(2_500_00);
    const april = summarize(entries, ctx, { start: '2025-04-01', end: '2025-04-30' });
    expect(april.spending).toBe(0);
    expect(april.cardPayments).toBe(2_500_00);
    expect(summarize(entries, ctx).spending).toBe(2_500_00);
  });
});

describe('rule 4: saving is not spending', () => {
  it('reports transfers into savings separately', () => {
    const entries = [
      entry('income', 80_000_00, '2025-03-01', 'bank', { categoryId: 'salary' }),
      entry('transfer', 10_000_00, '2025-03-05', 'bank', { toAccountId: 'fund' }),
      entry('transfer', 5_000_00, '2025-03-06', 'bank', { toAccountId: 'fd' }),
      entry('transfer', 2_000_00, '2025-03-07', 'bank', { toAccountId: 'cash' }),
      entry('expense', 20_000_00, '2025-03-08', 'bank', { categoryId: 'food' }),
    ];
    const s = summarize(entries, ctx, march);
    expect(s.spending).toBe(20_000_00);
    expect(s.saved).toBe(15_000_00);
    expect(s.income).toBe(80_000_00);
    expect(s.leftover).toBe(80_000_00 - 20_000_00 - 15_000_00);
  });

  it('nets withdrawals and ignores moves between saving accounts', () => {
    const entries = [
      entry('transfer', 10_000_00, '2025-03-05', 'bank', { toAccountId: 'fund' }),
      entry('transfer', 4_000_00, '2025-03-09', 'fund', { toAccountId: 'bank' }),
      entry('transfer', 1_000_00, '2025-03-10', 'fund', { toAccountId: 'fd' }),
    ];
    expect(summarize(entries, ctx, march).saved).toBe(6_000_00);
  });
});

describe('rule 5: refunds and cashback', () => {
  it('reduce spending in their category in the month credited', () => {
    const entries = [
      entry('expense', 3_000_00, '2025-03-10', 'card', { categoryId: 'shopping' }),
      entry('refund', 1_000_00, '2025-03-15', 'card', { categoryId: 'shopping' }),
    ];
    const s = summarize(entries, ctx, march);
    expect(s.byCategory.get('shopping')).toMatchObject({
      gross: 3_000_00,
      credits: 1_000_00,
      net: 2_000_00,
    });
    expect(s.spending).toBe(2_000_00);
    expect(s.income).toBe(0);
  });

  it('never push a category below zero for the month', () => {
    const entries = [
      entry('expense', 500_00, '2025-04-02', 'card', { categoryId: 'shopping' }),
      entry('refund', 3_000_00, '2025-04-03', 'card', { categoryId: 'shopping' }),
      entry('expense', 700_00, '2025-04-04', 'bank', { categoryId: 'food' }),
    ];
    const s = summarize(entries, ctx);
    expect(s.byCategory.get('shopping')!.net).toBe(0);
    expect(s.spending).toBe(700_00);
  });

  it('count as income when there is no spending category to reduce', () => {
    const entries = [
      entry('refund', 200_00, '2025-03-15', 'card'),
      entry('refund', 300_00, '2025-03-16', 'bank', { categoryId: 'refunds' }),
    ];
    const s = summarize(entries, ctx, march);
    expect(s.income).toBe(500_00);
    expect(s.incomeByCategory.get(UNCATEGORIZED)).toBe(200_00);
    expect(s.spending).toBe(0);
  });
});

describe('rule 6: adjustments', () => {
  it('are left out unless filed under a category', () => {
    const s = summarize([entry('adjustment', -900_00, '2025-03-20', 'bank')], ctx, march);
    expect(s.spending).toBe(0);
    expect(s.income).toBe(0);
    expect(s.count).toBe(0);
  });

  it('count as spending in a spending category', () => {
    const entries = [
      entry('adjustment', -900_00, '2025-03-20', 'bank', { categoryId: 'food' }),
      entry('adjustment', 100_00, '2025-03-21', 'bank', { categoryId: 'food' }),
    ];
    expect(summarize(entries, ctx, march).spending).toBe(800_00);
  });

  it('count as income in an income category', () => {
    const entries = [entry('adjustment', 250_00, '2025-03-20', 'bank', { categoryId: 'salary' })];
    expect(summarize(entries, ctx, march).income).toBe(250_00);
  });

  it('are left out when the category no longer exists', () => {
    const entries = [entry('adjustment', -5_00, '2025-03-20', 'bank', { categoryId: 'gone' })];
    expect(summarize(entries, ctx, march).spending).toBe(0);
  });
});

describe('categories', () => {
  const entries = [
    entry('expense', 400_00, '2025-03-02', 'bank', { categoryId: 'food' }),
    entry('expense', 600_00, '2025-03-03', 'card', { categoryId: 'dining' }),
    entry('expense', 100_00, '2025-03-04', 'cash'),
    entry('expense', 50_00, '2025-03-04', 'cash', { status: 'scheduled' }),
    entry('expense', 999_00, '2025-02-28', 'cash', { categoryId: 'food' }),
  ];
  const s = summarize(entries, ctx, march);

  it('keeps uncategorised spending and skips scheduled and out-of-range entries', () => {
    expect(s.spending).toBe(1_100_00);
    expect(s.byCategory.get(UNCATEGORIZED)!.net).toBe(100_00);
    expect(s.count).toBe(3);
  });

  it('rolls subcategories up to their parent', () => {
    expect(spendingByTopCategory(s, categories)).toEqual([
      { categoryId: 'food', amount: 1_000_00 },
      { categoryId: UNCATEGORIZED, amount: 100_00 },
    ]);
  });

  it('sums a chosen set of categories, including children of a chosen parent', () => {
    expect(spendingForCategories(s, ['food'], categories)).toBe(1_000_00);
    expect(spendingForCategories(s, ['dining'], categories)).toBe(600_00);
    expect(spendingForCategories(s, ['food', 'dining'], categories)).toBe(1_000_00);
    expect(spendingForCategories(s, ['shopping'], categories)).toBe(0);
  });

  it('treats an expense filed under an income category as spending', () => {
    const odd = summarize(
      [entry('expense', 10_00, '2025-03-02', 'bank', { categoryId: 'salary' })],
      ctx,
    );
    expect(odd.spending).toBe(10_00);
  });
});

describe('rule 8: exact paise', () => {
  it('adds many small amounts without drift', () => {
    const entries = Array.from({ length: 3000 }, () =>
      entry('expense', 10, '2025-03-02', 'bank', { categoryId: 'food' }),
    );
    entries.push(entry('expense', 33_33_33_333_33, '2025-03-02', 'bank', { categoryId: 'food' }));
    expect(summarize(entries, ctx).spending).toBe(33_33_33_333_33 + 30_000);
  });
});
