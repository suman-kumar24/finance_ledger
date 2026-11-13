import { saveKeyword } from '@/data/keywords';
import { getDb } from '@/db/client';
import type { Transaction } from '@/domain/types';
import { fireBudgetAlerts, syncNotifications } from '@/notify';
import { keywordsToLearn } from '@/parse';

export interface ParsedHint {
  /** The word the parser used to pick a category, if any. */
  keyword: string | null;
  categoryId: string | null;
}

/**
 * Runs after an entry is saved: remembers which category the user chose for
 * this payee (so the parser gets it right next time), fires budget alerts,
 * then refreshes reminders.
 */
export function afterEntrySaved(tx: Transaction, _typedPayee: string, parsed?: ParsedHint): void {
  const db = getDb();
  if (tx.type === 'expense' || tx.type === 'income') {
    const words = keywordsToLearn({
      payee: tx.payee,
      parsedKeyword: parsed?.keyword ?? null,
      parsedCategoryId: parsed?.categoryId ?? null,
      chosenCategoryId: tx.categoryId,
    });
    if (tx.categoryId) for (const word of words) saveKeyword(db, word, tx.categoryId, 'learned');
  }
  void fireBudgetAlerts(db, tx.day)
    .catch(() => [])
    .then(() => syncNotifications(db));
}
