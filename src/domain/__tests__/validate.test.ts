import { normalizeType, validateTransaction } from '../validate';

const accounts = new Map([
  ['bank', { type: 'bank' as const }],
  ['card', { type: 'credit_card' as const }],
  ['card2', { type: 'credit_card' as const }],
  ['fund', { type: 'investment' as const }],
]);
const base = {
  type: 'expense' as const,
  amount: 100,
  day: '2025-03-01',
  accountId: 'bank',
  toAccountId: null,
};

describe('validateTransaction', () => {
  it('accepts valid entries', () => {
    expect(validateTransaction(base, accounts)).toEqual([]);
    expect(
      validateTransaction({ ...base, type: 'transfer', toAccountId: 'fund' }, accounts),
    ).toEqual([]);
    expect(
      validateTransaction({ ...base, type: 'card_payment', toAccountId: 'card' }, accounts),
    ).toEqual([]);
    expect(validateTransaction({ ...base, type: 'adjustment', amount: -5 }, accounts)).toEqual([]);
  });

  it('reports each problem', () => {
    expect(validateTransaction({ ...base, amount: 0 }, accounts)).toEqual(['amount_zero']);
    expect(validateTransaction({ ...base, amount: -1 }, accounts)).toEqual(['amount_negative']);
    expect(validateTransaction({ ...base, amount: 0.5 }, accounts)).toEqual(['amount_invalid']);
    expect(validateTransaction({ ...base, day: 'x' }, accounts)).toEqual(['day_invalid']);
    expect(validateTransaction({ ...base, accountId: 'x' }, accounts)).toEqual(['account_missing']);
    expect(validateTransaction({ ...base, toAccountId: 'fund' }, accounts)).toEqual([
      'destination_unexpected',
    ]);
    expect(validateTransaction({ ...base, type: 'transfer' }, accounts)).toEqual([
      'destination_missing',
    ]);
    expect(
      validateTransaction({ ...base, type: 'transfer', toAccountId: 'bank' }, accounts),
    ).toEqual(['destination_same']);
    expect(
      validateTransaction({ ...base, type: 'card_payment', toAccountId: 'fund' }, accounts),
    ).toEqual(['destination_not_card']);
    expect(
      validateTransaction(
        { ...base, type: 'card_payment', accountId: 'card2', toAccountId: 'card' },
        accounts,
      ),
    ).toEqual(['source_is_card']);
  });
});

describe('normalizeType', () => {
  it('treats a transfer into a card as a bill payment', () => {
    expect(normalizeType({ ...base, type: 'transfer', toAccountId: 'card' }, accounts)).toBe(
      'card_payment',
    );
    expect(normalizeType({ ...base, type: 'transfer', toAccountId: 'fund' }, accounts)).toBe(
      'transfer',
    );
    expect(
      normalizeType(
        { ...base, type: 'transfer', accountId: 'card2', toAccountId: 'card' },
        accounts,
      ),
    ).toBe('transfer');
    expect(normalizeType(base, accounts)).toBe('expense');
  });
});
