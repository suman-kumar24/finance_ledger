import { getDb } from '@/db/client';
import type { Transaction } from '@/domain/types';
import { fireBudgetAlerts, syncNotifications } from '@/notify';

/** Runs after an entry is saved: budget alerts, then refreshed reminders. */
export function afterEntrySaved(tx: Transaction, _typedPayee: string): void {
  const db = getDb();
  void fireBudgetAlerts(db, tx.day)
    .catch(() => [])
    .then(() => syncNotifications(db));
}
