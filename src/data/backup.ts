import * as schema from '@/db/schema';
import type { Db } from '@/db/types';
import {
  buildSnapshot,
  validateSnapshot,
  type BackupData,
  type BackupFile,
  type BackupTable,
  type Row,
} from '@/backup/format/snapshot';

import { emitChange } from './bus';
import { DEVICE_ONLY_SETTINGS } from './settings';
import { TABLES_IN_DELETE_ORDER } from './wipe';

/** Backup table name -> Drizzle table, in an order that satisfies foreign keys on insert. */
const TABLES: [BackupTable, (typeof TABLES_IN_DELETE_ORDER)[number]][] = [
  ['accounts', schema.accounts],
  ['categories', schema.categories],
  ['transactions', schema.transactions],
  ['budgets', schema.budgets],
  ['budgetCategories', schema.budgetCategories],
  ['recurringRules', schema.recurringRules],
  ['goals', schema.goals],
  ['goalContributions', schema.goalContributions],
  ['plannedPurchases', schema.plannedPurchases],
  ['cardStatements', schema.cardStatements],
  ['reconciliations', schema.reconciliations],
  ['categoryKeywords', schema.categoryKeywords],
  ['smsAccountMap', schema.smsAccountMap],
  ['alertLog', schema.alertLog],
  ['settings', schema.settings],
];

const DEVICE_KEYS = new Set<string>(DEVICE_ONLY_SETTINGS);

/**
 * Everything in the database as one object. Settings that describe this
 * phone (app lock, backup account, SMS switches) are left out, as is the
 * SMS review inbox. The PIN and backup passphrase are never in the database.
 */
export function exportSnapshot(db: Db, appVersion: string, now = Date.now()): BackupFile {
  const data = {} as BackupData;
  for (const [name, table] of TABLES) {
    const rows = db.select().from(table).all() as Row[];
    data[name] = name === 'settings' ? rows.filter((r) => !DEVICE_KEYS.has(String(r.key))) : rows;
  }
  return buildSnapshot(data, now, appVersion);
}

/**
 * Replaces all data with the contents of a backup, in one database
 * transaction: either everything is restored or nothing changes. This
 * phone's own settings (lock, backup, SMS) are kept.
 */
export function restoreSnapshot(db: Db, input: unknown): BackupFile {
  const file = validateSnapshot(input);
  db.transaction((tx) => {
    const keep = tx
      .select()
      .from(schema.settings)
      .all()
      .filter((row) => DEVICE_KEYS.has(row.key));
    for (const table of TABLES_IN_DELETE_ORDER) tx.delete(table).run();
    for (const [name, table] of TABLES) {
      let rows = file.data[name];
      if (name === 'settings') rows = rows.filter((r) => !DEVICE_KEYS.has(String(r.key)));
      for (let i = 0; i < rows.length; i += 100) {
        // Rows were written by this app's own schema; the column check happens in SQLite.
        tx.insert(table)
          .values(rows.slice(i, i + 100) as never)
          .run();
      }
    }
    if (keep.length > 0) tx.insert(schema.settings).values(keep).run();
  });
  emitChange();
  return file;
}
