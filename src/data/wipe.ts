import * as schema from '@/db/schema';
import type { Db } from '@/db/types';

import { emitChange } from './bus';

/** Tables in an order that respects foreign keys (children first). */
export const TABLES_IN_DELETE_ORDER = [
  schema.goalContributions,
  schema.plannedPurchases,
  schema.goals,
  schema.budgetCategories,
  schema.budgets,
  schema.categoryKeywords,
  schema.smsAccountMap,
  schema.smsInbox,
  schema.cardStatements,
  schema.reconciliations,
  schema.recurringRules,
  schema.transactions,
  schema.categories,
  schema.accounts,
  schema.alertLog,
  schema.settings,
] as const;

/** Deletes every row in every table. The app returns to onboarding. */
export function wipeAllData(db: Db): void {
  db.transaction((tx) => {
    for (const table of TABLES_IN_DELETE_ORDER) tx.delete(table).run();
  });
  emitChange();
}
