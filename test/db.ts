import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '@/db/schema';
import type { Db } from '@/db/types';

/** A fresh in-memory database with every migration applied. */
export function createTestDb(): { db: Db; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '..', 'drizzle') });
  return { db: db as unknown as Db, raw };
}
