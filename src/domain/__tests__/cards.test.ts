import { account, entry } from '../../../test/factories';
import {
  cardStatus,
  cycleContaining,
  cycleEndingOn,
  cycleHistory,
  dueDateFor,
  nextStatementDate,
  previousStatementDate,
  statementDateOnOrBefore,
} from '../cards';
import type { CardStatement } from '../types';

const card = account('card', 'credit_card', {
  creditLimit: 100_000_00,
  statementDay: 5,
  dueDay: 25,
});

describe('rule 3: statement and due dates', () => {
  it('finds statement dates around a day', () => {
    expect(statementDateOnOrBefore('2025-03-05', 5)).toBe('2025-03-05');
    expect(statementDateOnOrBefore('2025-03-04', 5)).toBe('2025-02-05');
    expect(nextStatementDate('2025-03-05', 5)).toBe('2025-04-05');
    expect(nextStatementDate('2025-03-04', 5)).toBe('2025-03-05');
    expect(previousStatementDate('2025-01-05', 5)).toBe('2024-12-05');
  });

  it('clamps a statement day the month does not have', () => {
    expect(statementDateOnOrBefore('2025-02-28', 31)).toBe('2025-02-28');
    expect(statementDateOnOrBefore('2025-03-15', 31)).toBe('2025-02-28');
    expect(nextStatementDate('2025-02-28', 31)).toBe('2025-03-31');
    expect(previousStatementDate('2025-03-31', 31)).toBe('2025-02-28');
  });

  it('puts the due date after the statement date', () => {
    expect(dueDateFor('2025-03-05', 25)).toBe('2025-03-25');
    expect(dueDateFor('2025-03-20', 8)).toBe('2025-04-08');
    expect(dueDateFor('2025-03-20', 20)).toBe('2025-04-20');
    expect(dueDateFor('2025-01-31', 31)).toBe('2025-02-28');
    expect(dueDateFor('2025-12-28', 15)).toBe('2026-01-15');
  });

  it('builds cycles that run from the day after one statement to the next', () => {
    expect(cycleEndingOn('2025-03-05', 5)).toEqual({ start: '2025-02-06', end: '2025-03-05' });
    expect(cycleContaining('2025-03-06', 5)).toEqual({ start: '2025-03-06', end: '2025-04-05' });
    expect(cycleContaining('2025-03-05', 5)).toEqual({ start: '2025-02-06', end: '2025-03-05' });
  });
});

describe('rule 3: bill, unbilled and outstanding', () => {
  const entries = [
    entry('expense', 4_000_00, '2025-02-20', 'card'), // in the cycle closing 5 Mar
    entry('expense', 1_000_00, '2025-03-05', 'card'), // on the statement date: billed
    entry('expense', 2_000_00, '2025-03-10', 'card'), // after the statement: unbilled
  ];

  it('separates the current bill from unbilled spending', () => {
    const s = cardStatus(card, entries, '2025-03-12');
    expect(s.statementDate).toBe('2025-03-05');
    expect(s.statementTotal).toBe(5_000_00);
    expect(s.currentBill).toBe(5_000_00);
    expect(s.unbilled).toBe(2_000_00);
    expect(s.outstanding).toBe(7_000_00);
    expect(s.dueDate).toBe('2025-03-25');
    expect(s.daysUntilDue).toBe(13);
    expect(s.billState).toBe('due');
    expect(s.nextStatementDate).toBe('2025-04-05');
    expect(s.utilisation).toBeCloseTo(0.07);
    expect(s.availableCredit).toBe(93_000_00);
  });

  it('reduces the bill by payments made after the statement', () => {
    const paid = [
      ...entries,
      entry('card_payment', 3_000_00, '2025-03-15', 'bank', { toAccountId: 'card' }),
    ];
    const s = cardStatus(card, paid, '2025-03-16');
    expect(s.paidSinceStatement).toBe(3_000_00);
    expect(s.currentBill).toBe(2_000_00);
    expect(s.unbilled).toBe(2_000_00);
    expect(s.outstanding).toBe(4_000_00);
  });

  it('marks the bill paid, and counts an overpayment against unbilled spending', () => {
    const paid = [
      ...entries,
      entry('card_payment', 5_500_00, '2025-03-15', 'bank', { toAccountId: 'card' }),
    ];
    const s = cardStatus(card, paid, '2025-03-16');
    expect(s.billState).toBe('paid');
    expect(s.currentBill).toBe(0);
    expect(s.unbilled).toBe(1_500_00);
    expect(s.outstanding).toBe(1_500_00);
  });

  it('keeps outstanding = bill + unbilled when a refund arrives after the statement', () => {
    const withRefund = [...entries, entry('refund', 500_00, '2025-03-11', 'card')];
    const s = cardStatus(card, withRefund, '2025-03-12');
    expect(s.currentBill).toBe(5_000_00);
    expect(s.unbilled).toBe(1_500_00);
    expect(s.currentBill + s.unbilled).toBe(s.outstanding);
  });

  it('tracks the bill state as the due date approaches and passes', () => {
    expect(cardStatus(card, entries, '2025-03-22').billState).toBe('due_soon');
    expect(cardStatus(card, entries, '2025-03-25').billState).toBe('due_today');
    expect(cardStatus(card, entries, '2025-03-26').billState).toBe('overdue');
  });

  it('rolls an unpaid bill into the next statement', () => {
    const s = cardStatus(card, entries, '2025-04-06');
    expect(s.statementDate).toBe('2025-04-05');
    expect(s.statementTotal).toBe(7_000_00);
    expect(s.unbilled).toBe(0);
  });

  it('ignores scheduled entries and other accounts', () => {
    const extra = [
      ...entries,
      entry('expense', 9_000_00, '2025-03-01', 'card', { status: 'scheduled' }),
      entry('expense', 9_000_00, '2025-03-01', 'bank'),
    ];
    expect(cardStatus(card, extra, '2025-03-12').outstanding).toBe(7_000_00);
  });

  it('has no bill when nothing was owed at the statement date', () => {
    const s = cardStatus(card, [entry('expense', 100_00, '2025-03-10', 'card')], '2025-03-12');
    expect(s.billState).toBe('none');
    expect(s.currentBill).toBe(0);
    expect(s.unbilled).toBe(100_00);
  });
});

describe('statement details typed in by the user', () => {
  const entries = [entry('expense', 4_000_00, '2025-02-20', 'card')];
  const statements: CardStatement[] = [
    {
      id: 's1',
      accountId: 'card',
      statementDate: '2025-03-05',
      minimumDue: 200_00,
      statedTotal: 4_150_00,
    },
  ];

  it('uses the stated total and shows the minimum due', () => {
    const s = cardStatus(card, entries, '2025-03-12', statements);
    expect(s.statementTotal).toBe(4_150_00);
    expect(s.statementTotalIsStated).toBe(true);
    expect(s.minimumDue).toBe(200_00);
    expect(s.currentBill).toBe(4_150_00);
    expect(s.unbilled).toBe(-150_00);
  });

  it('falls back to the computed total when only the minimum due is entered', () => {
    const s = cardStatus(card, entries, '2025-03-12', [
      {
        id: 's1',
        accountId: 'card',
        statementDate: '2025-03-05',
        minimumDue: 200_00,
        statedTotal: null,
      },
    ]);
    expect(s.statementTotal).toBe(4_000_00);
    expect(s.minimumDue).toBe(200_00);
  });
});

describe('cards added part-way through a cycle', () => {
  const added = account('new', 'credit_card', {
    openingBalance: -6_000_00,
    openingDate: '2025-03-10',
    statementDay: 5,
    dueDay: 25,
  });

  it('treats the opening outstanding as the current bill', () => {
    const s = cardStatus(added, [entry('expense', 500_00, '2025-03-11', 'new')], '2025-03-12');
    expect(s.statementTotal).toBe(6_000_00);
    expect(s.currentBill).toBe(6_000_00);
    expect(s.unbilled).toBe(500_00);
    expect(s.outstanding).toBe(6_500_00);
  });

  it('counts only payments made on or after the opening date', () => {
    const entries = [
      entry('card_payment', 1_000_00, '2025-03-08', 'bank', { toAccountId: 'new' }),
      entry('card_payment', 2_000_00, '2025-03-11', 'bank', { toAccountId: 'new' }),
    ];
    const s = cardStatus(added, entries, '2025-03-12');
    expect(s.paidSinceStatement).toBe(2_000_00);
    expect(s.currentBill).toBe(4_000_00);
    expect(s.outstanding).toBe(4_000_00);
  });
});

describe('cards without cycle details', () => {
  it('reports everything as unbilled', () => {
    const plain = account('plain', 'credit_card');
    const s = cardStatus(plain, [entry('expense', 300_00, '2025-03-10', 'plain')], '2025-03-12');
    expect(s).toMatchObject({
      statementDate: null,
      currentBill: 0,
      unbilled: 300_00,
      billState: 'none',
      utilisation: 0,
      availableCredit: null,
    });
    expect(cycleHistory(plain, [], '2025-03-12')).toEqual([]);
  });

  it('shows a bill without a due date when only the statement day is set', () => {
    const noDue = account('nodue', 'credit_card', { statementDay: 5 });
    const s = cardStatus(noDue, [entry('expense', 300_00, '2025-03-01', 'nodue')], '2025-03-12');
    expect(s.dueDate).toBeNull();
    expect(s.billState).toBe('due');
  });
});

describe('cycle history', () => {
  const entries = [
    entry('expense', 4_000_00, '2025-02-20', 'card'),
    entry('refund', 500_00, '2025-02-22', 'card'),
    entry('card_payment', 3_500_00, '2025-03-15', 'bank', { toAccountId: 'card' }),
    entry('expense', 2_000_00, '2025-03-10', 'card'),
    entry('adjustment', -100_00, '2025-03-11', 'card'),
    entry('adjustment', 40_00, '2025-03-11', 'card'),
  ];

  it('lists the open cycle first, then closed cycles', () => {
    const history = cycleHistory(card, entries, '2025-03-20', 2);
    expect(history.map((c) => c.statementDate)).toEqual(['2025-04-05', '2025-03-05', '2025-02-05']);
    expect(history[0]).toMatchObject({
      open: true,
      start: '2025-03-06',
      purchases: 2_100_00,
      credits: 40_00,
      payments: 3_500_00,
      statementTotal: 2_060_00,
      dueDate: '2025-04-25',
    });
    expect(history[1]).toMatchObject({
      open: false,
      purchases: 4_000_00,
      credits: 500_00,
      payments: 0,
      statementTotal: 3_500_00,
    });
  });

  it('stops at the opening date', () => {
    const recent = account('recent', 'credit_card', {
      statementDay: 5,
      dueDay: 25,
      openingDate: '2025-03-01',
    });
    expect(cycleHistory(recent, [], '2025-03-20', 6).map((c) => c.statementDate)).toEqual([
      '2025-04-05',
      '2025-03-05',
    ]);
  });
});
