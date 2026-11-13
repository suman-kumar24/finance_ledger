import { CATEGORY_SEEDS } from '@/domain/defaults';

import { CATEGORY_KEYWORDS } from '../data/keywords';
import {
  flipKal,
  keywordsToLearn,
  parseEntry,
  type ParseContext,
  type ParsedEntry,
} from '../index';

/** Thursday 13 November 2025. */
const TODAY = '2025-11-13';

const ctx: ParseContext = {
  today: TODAY,
  accounts: [
    { id: 'bank', name: 'HDFC Bank', type: 'bank', last4: '1111' },
    { id: 'cash', name: 'Cash', type: 'cash', last4: null },
    { id: 'fk', name: 'Flipkart Card', type: 'credit_card', last4: '4321' },
    { id: 'wallet', name: 'Paytm Wallet', type: 'wallet', last4: null },
    { id: 'fund', name: 'Index Fund', type: 'investment', last4: null },
  ],
  // Category ids equal their keys, to keep expectations readable.
  categories: CATEGORY_SEEDS.map((s) => ({
    id: s.key,
    name: s.name.en,
    kind: s.kind,
    systemKey: s.key,
  })),
};

type Expected = Partial<ParsedEntry>;

const CASES: [string, Expected][] = [
  // The four phrases from the brief.
  [
    '400 on food last night via UPI',
    { amount: 400_00, categoryId: 'food', day: '2025-11-12', method: 'upi', type: 'expense' },
  ],
  [
    'groceries 444 flipkart card',
    { amount: 444_00, categoryId: 'groceries', accountId: 'fk', type: 'expense' },
  ],
  [
    'चार सौ रुपये खाना कल रात',
    { amount: 400_00, categoryId: 'food', day: '2025-11-12', type: 'expense' },
  ],
  [
    'mummy ko 10000 diye',
    { amount: 10_000_00, categoryId: 'family', payee: 'Mummy', type: 'expense', day: TODAY },
  ],

  // Amounts.
  ['coffee 180', { amount: 180_00, categoryId: 'food' }],
  ['paid 1,200 for electricity', { amount: 1_200_00, categoryId: 'utilities' }],
  ['uber 1.2k', { amount: 1_200_00, categoryId: 'transport' }],
  ['rent 25k', { amount: 25_000_00, categoryId: 'rent' }],
  ['bike 1.5 lakh', { amount: 1_50_000_00 }],
  ['₹99.50 chai', { amount: 99_50, categoryId: 'food' }],
  ['rs 350 auto', { amount: 350_00, categoryId: 'transport' }],
  ['spent four hundred on lunch', { amount: 400_00, categoryId: 'food' }],
  ['two thousand five hundred for shoes', { amount: 2_500_00, categoryId: 'shopping' }],
  ['chaar sau khana', { amount: 400_00, categoryId: 'food' }],
  ['das hazaar kiraya', { amount: 10_000_00, categoryId: 'rent' }],
  [
    'pachpan hazaar ikyavan salary mili',
    { amount: 55_051_00, type: 'income', categoryId: 'salary' },
  ],
  ['dedh sau ka petrol', { amount: 150_00, categoryId: 'transport' }],
  ['saadhe teen sau sabzi', { amount: 350_00, categoryId: 'groceries' }],
  ['दो हजार पांच सौ किराना', { amount: 2_500_00, categoryId: 'groceries' }],
  ['पचास रुपये चाय', { amount: 50_00, categoryId: 'food' }],
  ['बीस रुपये पचास पैसे दूध', { amount: 20_50, categoryId: 'groceries' }],
  ['medicine 245.75', { amount: 245_75, categoryId: 'health' }],
  ['2 pizzas 600', { amount: 600_00, categoryId: 'food', uncertain: ['amount'] }],
  ['3 movie tickets ₹900', { amount: 900_00, categoryId: 'entertainment', uncertain: [] }],

  // Dates.
  ['lunch 250 today', { day: TODAY, amount: 250_00 }],
  ['lunch 250 yesterday', { day: '2025-11-12' }],
  ['aaj 60 chai', { day: TODAY, amount: 60_00 }],
  ['kal 500 petrol diya', { day: '2025-11-12', uncertain: [] }],
  ['kal 500 petrol', { day: '2025-11-12', uncertain: ['date'] }],
  ['kal 15000 kiraya dena hai', { day: '2025-11-14', amount: 15_000_00, categoryId: 'rent' }],
  ['parso 300 dawai li', { day: '2025-11-11', categoryId: 'health' }],
  ['परसों 300 दवाई', { day: '2025-11-11', categoryId: 'health' }],
  ['day before yesterday 300 medicines', { day: '2025-11-11' }],
  ['3 days ago 800 shopping', { day: '2025-11-10', amount: 800_00 }],
  ['2 din pehle 800 kapde', { day: '2025-11-11', amount: 800_00, categoryId: 'shopping' }],
  ['monday 450 groceries', { day: '2025-11-10', amount: 450_00 }],
  ['last friday dinner 1200', { day: '2025-11-07', amount: 1_200_00 }],
  ['thursday 90 tea', { day: TODAY }],
  ['last thursday 90 tea', { day: '2025-11-06' }],
  ['somvar ko 200 sabzi', { day: '2025-11-10', categoryId: 'groceries' }],
  ['5 nov 700 doctor', { day: '2025-11-05', amount: 700_00, categoryId: 'health' }],
  ['doctor 700 on 5th november', { day: '2025-11-05', amount: 700_00 }],
  ['march 3 gift 1500', { day: '2025-03-03', amount: 1_500_00, categoryId: 'gifts' }],
  ['25 december 2024 gift 1500', { day: '2024-12-25', amount: 1_500_00 }],
  ['25 dec flight 6500', { day: '2024-12-25', amount: 6_500_00, categoryId: 'travel' }],
  ['12/11 bus 40', { day: '2025-11-12', amount: 40_00, categoryId: 'transport' }],
  [
    '12-10-2025 school fees 12000',
    { day: '2025-10-12', amount: 12_000_00, categoryId: 'education' },
  ],
  ['10 tarikh ko 3000 bijli', { day: '2025-11-10', amount: 3_000_00, categoryId: 'utilities' }],
  ['20 tarikh 999 netflix', { day: '2025-10-20', amount: 999_00, categoryId: 'subscriptions' }],
  ['tomorrow 2000 rent', { day: '2025-11-14' }],
  ['this morning 30 chai', { day: TODAY }],
  ['tonight dinner 800', { day: TODAY, amount: 800_00 }],

  // Categories.
  ['zomato 320', { categoryId: 'food' }],
  ['blinkit 610', { categoryId: 'groceries' }],
  ['wifi 799', { categoryId: 'utilities' }],
  ['haircut 250', { categoryId: 'personal_care' }],
  ['light bill 1800', { categoryId: 'utilities' }],
  ['late fee 500', { categoryId: 'fees' }],
  ['school fees 9000', { categoryId: 'education' }],
  ['पेट्रोल 500', { categoryId: 'transport' }],
  ['कपड़े 2200', { categoryId: 'shopping', amount: 2_200_00 }],
  ['papa ko 5000 bheje', { categoryId: 'family', payee: 'Papa' }],
  ['xyzabc 300', { categoryId: null, uncertain: ['category'], payee: 'Xyzabc' }],
  ['Food & Dining 120', { categoryId: 'food' }],

  // Accounts and methods.
  ['petrol 2000 cash', { method: 'cash', accountId: 'cash' }],
  ['नकद 200 सब्जी', { method: 'cash', accountId: 'cash', categoryId: 'groceries' }],
  ['amazon 1499 card', { method: 'card', accountId: 'fk' }],
  ['dinner 900 hdfc', { accountId: 'bank', categoryId: 'food' }],
  ['recharge 299 paytm wallet', { accountId: 'wallet', categoryId: 'utilities' }],
  ['fuel 1500 card 4321', { accountId: 'fk', amount: 1_500_00 }],
  ['gpay 150 auto', { method: 'upi', categoryId: 'transport' }],
  ['neft 20000 rent', { method: 'netbanking', categoryId: 'rent' }],
  ['snacks 80', { accountId: null, method: null }],

  // Types.
  ['salary 85000 received', { type: 'income', categoryId: 'salary', amount: 85_000_00 }],
  ['salary 85000', { type: 'income', categoryId: 'salary' }],
  ['50000 aaya client se', { type: 'income', categoryId: 'freelance', amount: 50_000_00 }],
  ['ब्याज 320 मिला', { type: 'income', categoryId: 'interest' }],
  ['got 2000 from Rahul', { type: 'income', payee: 'Rahul' }],
  ['refund 499 amazon', { type: 'refund', amount: 499_00 }],
  ['cashback 50 flipkart card', { type: 'refund', accountId: 'fk', amount: 50_00 }],
  [
    'sip 5000 index fund',
    { type: 'transfer', toAccountId: 'fund', amount: 5_000_00, categoryId: null },
  ],
  [
    'transfer 10000 from hdfc to index fund',
    { type: 'transfer', accountId: 'bank', toAccountId: 'fund' },
  ],
  [
    'hdfc se index fund me 3000',
    { type: 'transfer', accountId: 'bank', toAccountId: 'fund', amount: 3_000_00 },
  ],
  [
    'transfer 8000 hdfc to flipkart card',
    { type: 'card_payment', accountId: 'bank', toAccountId: 'fk' },
  ],
  ['transfer 2000', { type: 'transfer', uncertain: ['type'] }],

  // Payees.
  ['paid 300 to Sharma Stores', { payee: 'Sharma Stores', amount: 300_00 }],
  ['lunch 450 at Blue Tokai', { payee: 'Blue Tokai', categoryId: 'food' }],
  ['raju ko 200 diye', { payee: 'Raju', amount: 200_00 }],
  ['राजू को 200 दिए', { payee: 'राजू', amount: 200_00 }],
  ['dmart se 2300 ka saman', { categoryId: 'groceries', amount: 2_300_00 }],

  // Nothing useful.
  ['lunch', { amount: null, categoryId: 'food', uncertain: ['amount'] }],
  ['', { amount: null, uncertain: ['amount', 'category'], day: TODAY, type: 'expense' }],
];

describe('parseEntry', () => {
  it('has at least 60 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CASES)('"%s"', (text, expected) => {
    const result = parseEntry(text, ctx);
    const { uncertain, ...fields } = expected;
    expect(result).toMatchObject(fields);
    if (uncertain) expect([...result.uncertain].sort()).toEqual([...uncertain].sort());
  });

  it('never returns a negative or fractional amount', () => {
    for (const [text] of CASES) {
      const { amount } = parseEntry(text, ctx);
      if (amount !== null) {
        expect(Number.isSafeInteger(amount)).toBe(true);
        expect(amount).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic', () => {
    for (const [text] of CASES.slice(0, 20))
      expect(parseEntry(text, ctx)).toEqual(parseEntry(text, ctx));
  });
});

describe('user keywords and learning', () => {
  it('prefers the user dictionary over the built-in one', () => {
    const custom = { ...ctx, userKeywords: [{ keyword: 'zomato', categoryId: 'entertainment' }] };
    expect(parseEntry('zomato 320', custom).categoryId).toBe('entertainment');
    expect(parseEntry('zomato 320', ctx).categoryId).toBe('food');
  });

  it('uses a learned payee', () => {
    const learned = {
      ...ctx,
      userKeywords: [{ keyword: 'sharma stores', categoryId: 'groceries' }],
    };
    expect(parseEntry('sharma stores 640', learned)).toMatchObject({
      categoryId: 'groceries',
      amount: 640_00,
      uncertain: [],
    });
  });

  it('matches categories the user created by name', () => {
    const own = {
      ...ctx,
      categories: [
        ...ctx.categories,
        { id: 'pets', name: 'Pets', kind: 'expense' as const, systemKey: null },
      ],
    };
    expect(parseEntry('pets 900', own).categoryId).toBe('pets');
  });

  it('ignores keywords for the wrong kind of entry', () => {
    const odd = { ...ctx, userKeywords: [{ keyword: 'bonus', categoryId: 'salary' }] };
    expect(parseEntry('spent 500 bonus', odd).categoryId).toBeNull();
    expect(parseEntry('bonus 500', odd)).toMatchObject({ type: 'income', categoryId: 'salary' });
  });

  it('works out what to remember from a save', () => {
    expect(
      keywordsToLearn({
        payee: 'Sharma Stores',
        parsedKeyword: null,
        parsedCategoryId: null,
        chosenCategoryId: 'groceries',
      }),
    ).toEqual(['sharma stores']);
    expect(
      keywordsToLearn({
        payee: null,
        parsedKeyword: 'amazon',
        parsedCategoryId: 'shopping',
        chosenCategoryId: 'gifts',
      }),
    ).toEqual(['amazon']);
    expect(
      keywordsToLearn({
        payee: 'Amazon',
        parsedKeyword: 'amazon',
        parsedCategoryId: 'shopping',
        chosenCategoryId: 'shopping',
      }),
    ).toEqual(['amazon']);
    expect(
      keywordsToLearn({
        payee: 'ab',
        parsedKeyword: null,
        parsedCategoryId: null,
        chosenCategoryId: 'food',
      }),
    ).toEqual([]);
    expect(
      keywordsToLearn({
        payee: 'Shop',
        parsedKeyword: 'x',
        parsedCategoryId: 'a',
        chosenCategoryId: null,
      }),
    ).toEqual([]);
  });

  it('guesses a card only when there is exactly one', () => {
    const two = {
      ...ctx,
      accounts: [
        ...ctx.accounts,
        { id: 'c2', name: 'Travel Card', type: 'credit_card' as const, last4: null },
      ],
    };
    expect(parseEntry('amazon 1499 card', two)).toMatchObject({
      accountId: null,
      uncertain: ['account'],
    });
    expect(parseEntry('amazon 1499 travel card', two).accountId).toBe('c2');
  });

  it('flips an ambiguous "kal"', () => {
    expect(flipKal('2025-11-12', TODAY)).toBe('2025-11-14');
    expect(flipKal('2025-11-14', TODAY)).toBe('2025-11-12');
  });

  it('respects currencies without minor units', () => {
    expect(parseEntry('lunch 1200.60', { ...ctx, decimals: 0 }).amount).toBe(1201);
  });
});

describe('dictionary data', () => {
  it('covers every default category', () => {
    for (const seed of CATEGORY_SEEDS) {
      if (seed.key === 'other' || seed.key === 'other_income') continue;
      expect(CATEGORY_KEYWORDS[seed.key]?.length ?? 0).toBeGreaterThan(3);
    }
  });

  it('includes Hindi words for the everyday categories', () => {
    for (const key of ['food', 'groceries', 'transport', 'utilities', 'health', 'family']) {
      expect(CATEGORY_KEYWORDS[key]?.some((w) => /[ऀ-ॿ]/.test(w))).toBe(true);
    }
  });
});
