import { account, entry } from '../../../test/factories';
import {
  accountBalance,
  balanceDelta,
  balancesFromSums,
  computeBalances,
  netWorth,
  outstandingFromBalance,
  type MovementSum,
} from '../balances';

const bank = account('bank', 'bank', { openingBalance: 10_000_00 });
const cash = account('cash', 'cash', { openingBalance: 500_00 });
const card = account('card', 'credit_card', {
  creditLimit: 100_000_00,
  statementDay: 5,
  dueDay: 25,
});
const fund = account('fund', 'investment');
const all = [bank, cash, card, fund];

describe('rule 1: transaction types', () => {
  it('applies each type to the right side of the ledger', () => {
    const entries = [
      entry('expense', 400_00, '2025-03-02', 'bank'),
      entry('income', 50_000_00, '2025-03-01', 'bank'),
      entry('transfer', 1_000_00, '2025-03-03', 'bank', { toAccountId: 'cash' }),
      entry('refund', 100_00, '2025-03-04', 'bank'),
      entry('adjustment', -25_00, '2025-03-05', 'bank'),
      entry('adjustment', 5_00, '2025-03-05', 'cash'),
    ];
    const b = computeBalances(all, entries);
    expect(b.get('bank')).toBe(10_000_00 - 400_00 + 50_000_00 - 1_000_00 + 100_00 - 25_00);
    expect(b.get('cash')).toBe(500_00 + 1_000_00 + 5_00);
  });

  it('ignores scheduled entries until they clear', () => {
    const scheduled = entry('expense', 999_00, '2025-03-02', 'bank', { status: 'scheduled' });
    expect(accountBalance(bank, [scheduled])).toBe(10_000_00);
    expect(balanceDelta(scheduled, 'bank')).toBe(0);
  });

  it('reports the effect of one entry on each account it touches', () => {
    const pay = entry('card_payment', 700_00, '2025-03-02', 'bank', { toAccountId: 'card' });
    expect(balanceDelta(pay, 'bank')).toBe(-700_00);
    expect(balanceDelta(pay, 'card')).toBe(700_00);
    expect(balanceDelta(pay, 'cash')).toBe(0);
  });
});

describe('rule 2: credit cards are liabilities', () => {
  const purchase = entry('expense', 2_500_00, '2025-03-10', 'card');
  const payment = entry('card_payment', 2_500_00, '2025-04-20', 'bank', { toAccountId: 'card' });

  it('a card purchase raises outstanding and leaves the bank untouched', () => {
    const b = computeBalances(all, [purchase]);
    expect(outstandingFromBalance(b.get('card')!)).toBe(2_500_00);
    expect(b.get('bank')).toBe(10_000_00);
  });

  it('paying the bill lowers both the bank balance and the outstanding', () => {
    const b = computeBalances(all, [purchase, payment]);
    expect(b.get('bank')).toBe(7_500_00);
    expect(outstandingFromBalance(b.get('card')!)).toBe(0);
  });

  it('cashback on the card lowers the outstanding', () => {
    const cashback = entry('refund', 50_00, '2025-03-12', 'card');
    const b = computeBalances(all, [purchase, cashback]);
    expect(outstandingFromBalance(b.get('card')!)).toBe(2_450_00);
  });

  it('an overpaid card shows a negative outstanding', () => {
    const over = entry('card_payment', 3_000_00, '2025-04-20', 'bank', { toAccountId: 'card' });
    expect(outstandingFromBalance(computeBalances(all, [purchase, over]).get('card')!)).toBe(
      -500_00,
    );
  });

  it('never returns negative zero', () => {
    expect(Object.is(outstandingFromBalance(0), 0)).toBe(true);
  });
});

describe('rule 4: transfers to savings', () => {
  it('moves money without losing any', () => {
    const sip = entry('transfer', 5_000_00, '2025-03-05', 'bank', { toAccountId: 'fund' });
    const b = computeBalances(all, [sip]);
    expect(b.get('bank')).toBe(5_000_00);
    expect(b.get('fund')).toBe(5_000_00);
    const totals = netWorth(all, b);
    expect(totals.availableToSpend).toBe(5_000_00 + 500_00);
    expect(totals.savedInvested).toBe(5_000_00);
    expect(totals.netWorth).toBe(10_500_00);
  });
});

describe('opening dates and backdated entries', () => {
  it('does not apply entries dated before the opening date', () => {
    const late = account('late', 'bank', { openingBalance: 1_000_00, openingDate: '2025-03-10' });
    const before = entry('expense', 200_00, '2025-03-09', 'late');
    const onDay = entry('expense', 300_00, '2025-03-10', 'late');
    expect(accountBalance(late, [before, onDay])).toBe(700_00);
  });

  it('applies each side of a transfer by its own account opening date', () => {
    const a = account('a', 'bank', { openingBalance: 1_000_00, openingDate: '2025-01-01' });
    const b = account('b', 'bank', { openingBalance: 0, openingDate: '2025-06-01' });
    const t = entry('transfer', 100_00, '2025-03-01', 'a', { toAccountId: 'b' });
    const balances = computeBalances([a, b], [t]);
    expect(balances.get('a')).toBe(900_00);
    expect(balances.get('b')).toBe(0);
  });

  it('computes a balance as of a past day', () => {
    const entries = [
      entry('expense', 100_00, '2025-03-01', 'bank'),
      entry('expense', 200_00, '2025-03-15', 'bank'),
    ];
    expect(accountBalance(bank, entries, { asOf: '2025-03-10' })).toBe(9_900_00);
    expect(accountBalance(bank, entries, { asOf: '2025-03-15' })).toBe(9_700_00);
  });

  it('ignores entries for unknown accounts', () => {
    const stray = entry('transfer', 100_00, '2025-03-01', 'ghost', { toAccountId: 'bank' });
    expect(computeBalances(all, [stray]).get('bank')).toBe(10_100_00);
    expect(accountBalance(bank, [])).toBe(10_000_00);
  });
});

describe('net worth', () => {
  it('is assets minus card outstanding, skipping archived accounts', () => {
    const old = account('old', 'bank', { openingBalance: 77_00, archived: true });
    const entries = [entry('expense', 3_000_00, '2025-03-10', 'card')];
    const totals = netWorth([...all, old], computeBalances([...all, old], entries));
    expect(totals.assets).toBe(10_500_00);
    expect(totals.cardOutstanding).toBe(3_000_00);
    expect(totals.netWorth).toBe(7_500_00);
    expect(totals.byType.credit_card).toBe(-3_000_00);
  });

  it('falls back to the opening balance when no balance was computed', () => {
    expect(netWorth([bank], new Map()).assets).toBe(10_000_00);
  });

  it('handles crores without losing paise', () => {
    const big = account('big', 'bank', { openingBalance: 25_00_00_000_00 + 1 });
    const b = computeBalances([big], [entry('expense', 1, '2025-03-01', 'big')]);
    expect(b.get('big')).toBe(25_00_00_000_00);
  });
});

describe('balances from grouped sums', () => {
  it('matches the entry-by-entry result', () => {
    const entries = [
      entry('expense', 400_00, '2025-03-02', 'bank'),
      entry('expense', 600_00, '2025-03-02', 'card'),
      entry('card_payment', 500_00, '2025-03-20', 'bank', { toAccountId: 'card' }),
      entry('transfer', 1_000_00, '2025-03-03', 'bank', { toAccountId: 'fund' }),
      entry('income', 2_000_00, '2025-03-03', 'bank'),
      entry('refund', 10_00, '2025-03-03', 'card'),
      entry('adjustment', -7_00, '2025-03-03', 'cash'),
    ];
    const sums: MovementSum[] = [];
    for (const e of entries) {
      sums.push({ accountId: e.accountId, side: 'primary', type: e.type, total: e.amount });
      if (e.toAccountId) {
        sums.push({ accountId: e.toAccountId, side: 'destination', type: e.type, total: e.amount });
      }
    }
    sums.push({ accountId: 'ghost', side: 'primary', type: 'expense', total: 1 });
    expect(balancesFromSums(all, sums)).toEqual(computeBalances(all, entries));
  });
});
