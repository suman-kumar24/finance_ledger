import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * A synchronous Drizzle SQLite database. The app uses expo-sqlite and the
 * tests use better-sqlite3; both satisfy this type, so repositories are
 * exercised against a real SQLite engine in Jest.
 */
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;
