import { desc, eq } from 'drizzle-orm';

import { reconciliations } from '@/db/schema';
import type { Db } from '@/db/types';
import type { Day } from '@/domain/dates';
import type { Reconciliation } from '@/domain/reconcile';
import { adjustmentFor } from '@/domain/reconcile';
import type { Transaction } from '@/domain/types';
import { newId } from '@/lib/id';

import { batch, emitChange } from './bus';
import { createTransaction } from './transactions';

/**
 * Records a balance check. With `adjust`, also books the "Unmatched"
 * adjustment that makes the app's balance agree with the real one.
 */
export function recordReconciliation(
  db: Db,
  accountId: string,
  result: Reconciliation,
  day: Day,
  options: { adjust: boolean; categoryId: string | null },
  now = Date.now(),
): Transaction | null {
  return batch(() => {
    let adjustment: Transaction | null = null;
    const draft = options.adjust ? adjustmentFor(accountId, result, day, options.categoryId) : null;
    if (draft) {
      adjustment = createTransaction(
        db,
        {
          type: 'adjustment',
          amount: draft.amount,
          day: draft.day,
          accountId: draft.accountId,
          categoryId: draft.categoryId,
          payee: draft.payee,
        },
        now,
      );
    }
    db.insert(reconciliations)
      .values({
        id: newId(),
        accountId,
        day,
        statedBalance: result.statedBalance,
        computedBalance: result.computedBalance,
        adjustmentTransactionId: adjustment?.id ?? null,
        createdAt: now,
      })
      .run();
    emitChange();
    return adjustment;
  });
}

export function lastReconciliation(db: Db, accountId: string) {
  return (
    db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.accountId, accountId))
      .orderBy(desc(reconciliations.createdAt))
      .limit(1)
      .get() ?? null
  );
}
