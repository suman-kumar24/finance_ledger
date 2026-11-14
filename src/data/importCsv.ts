import type { Db } from '@/db/types';
import type { DraftRow } from '@/csv';

import { batch } from './bus';
import { createTransaction, InvalidTransactionError } from './transactions';

/** Saves reviewed CSV rows as transactions. Returns how many were saved and which lines failed. */
export function saveImportedRows(
  db: Db,
  drafts: readonly DraftRow[],
  today: string,
): { saved: number; failed: number[] } {
  const failed: number[] = [];
  let saved = 0;
  batch(() => {
    for (const draft of drafts) {
      try {
        createTransaction(db, {
          type: draft.type,
          amount: draft.amount,
          day: draft.day,
          accountId: draft.accountId,
          toAccountId: draft.toAccountId,
          categoryId: draft.categoryId,
          payee: draft.payee,
          note: draft.note,
          method: draft.method,
          tags: draft.tags,
          source: 'import',
          status: draft.day > today ? 'scheduled' : 'cleared',
        });
        saved += 1;
      } catch (e) {
        if (!(e instanceof InvalidTransactionError)) throw e;
        failed.push(draft.line);
      }
    }
  });
  return { saved, failed };
}
