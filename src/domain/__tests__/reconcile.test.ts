import { account, category, entry, mapById } from '../../../test/factories';
import { accountBalance, outstandingFromBalance } from '../balances';
import {
  adjustmentFor,
  balanceToDisplay,
  reconcile,
  statedToBalance,
  UNMATCHED_LABEL,
} from '../reconcile';
import { summarize } from '../spending';

const bank = account('bank', 'bank', { openingBalance: 10_000_00 });
const card = account('card', 'credit_card');

describe('rule 6: reconciliation', () => {
  it('reports a match', () => {
    const r = reconcile(bank, 10_000_00, 10_000_00);
    expect(r).toMatchObject({ matched: true, difference: 0, direction: 'matched' });
    expect(adjustmentFor('bank', r, '2025-03-20', null)).toBeNull();
  });

  it('finds missing spending on a bank account', () => {
    const r = reconcile(bank, 10_000_00, 9_250_00);
    expect(r).toMatchObject({ difference: -750_00, direction: 'missing_spend' });
  });

  it('finds missing income', () => {
    expect(reconcile(bank, 10_000_00, 10_100_00)).toMatchObject({
      difference: 100_00,
      direction: 'missing_income',
    });
  });

  it('reads the entered figure as the amount owed for a credit card', () => {
    // App thinks 4,000 is owed; the statement says 4,300.
    const r = reconcile(card, -4_000_00, 4_300_00);
    expect(r.statedBalance).toBe(-4_300_00);
    expect(r).toMatchObject({ difference: -300_00, direction: 'missing_spend' });
    expect(statedToBalance('credit_card', 0)).toBe(0);
    expect(balanceToDisplay('credit_card', -4_000_00)).toBe(4_000_00);
    expect(balanceToDisplay('bank', 4_000_00)).toBe(4_000_00);
  });

  it('creates an "Unmatched" adjustment that makes the balances agree', () => {
    const r = reconcile(bank, 10_000_00, 9_250_00);
    const draft = adjustmentFor('bank', r, '2025-03-20', null)!;
    expect(draft).toMatchObject({ type: 'adjustment', amount: -750_00, payee: UNMATCHED_LABEL });
    const after = accountBalance(bank, [entry('adjustment', draft.amount, draft.day, 'bank')]);
    expect(after).toBe(9_250_00);
  });

  it('makes a card agree with its statement', () => {
    const r = reconcile(card, -4_000_00, 4_300_00);
    const draft = adjustmentFor('card', r, '2025-03-20', null)!;
    const after = accountBalance(card, [
      entry('expense', 4_000_00, '2025-03-01', 'card'),
      entry('adjustment', draft.amount, draft.day, 'card'),
    ]);
    expect(outstandingFromBalance(after)).toBe(4_300_00);
  });

  it('counts the adjustment as spending only when filed under a spending category', () => {
    const ctx = { accounts: mapById([bank]), categories: mapById([category('other')]) };
    const r = reconcile(bank, 10_000_00, 9_250_00);
    const plain = adjustmentFor('bank', r, '2025-03-20', null)!;
    const filed = adjustmentFor('bank', r, '2025-03-20', 'other')!;
    const asEntry = (d: typeof plain) =>
      entry('adjustment', d.amount, d.day, d.accountId, { categoryId: d.categoryId });
    expect(summarize([asEntry(plain)], ctx).spending).toBe(0);
    expect(summarize([asEntry(filed)], ctx).spending).toBe(750_00);
  });
});
