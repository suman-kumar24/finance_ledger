import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import * as schema from './schema';
import type { Db } from './types';

export const DATABASE_NAME = 'ledger.db';

let sqlite: SQLiteDatabase | null = null;
let db: Db | null = null;

/** Opens the database (once) and applies pending migrations. */
export async function initDatabase(): Promise<Db> {
  if (db) return db;
  sqlite = openDatabaseSync(DATABASE_NAME);
  sqlite.execSync('PRAGMA journal_mode = WAL;');
  sqlite.execSync('PRAGMA foreign_keys = ON;');
  const instance = drizzle(sqlite, { schema });
  await migrate(instance, migrations);
  db = instance;
  return instance;
}

/** The open database. Throws if initDatabase() has not completed. */
export function getDb(): Db {
  if (!db) throw new Error('Database is not ready yet');
  return db;
}

export function isDatabaseReady(): boolean {
  return db !== null;
}
