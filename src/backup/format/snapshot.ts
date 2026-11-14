/**
 * The backup file: one versioned JSON document holding every table.
 *
 * `schemaVersion` is bumped whenever the shape of `data` changes. A newer
 * app can read older files (see `migrateSnapshot`); an older app refuses a
 * newer file rather than guessing.
 */
export const BACKUP_APP_ID = 'ledger';
export const BACKUP_SCHEMA_VERSION = 1;

/** Table name -> rows, exactly as stored (money as integer minor units). */
export const BACKUP_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'budgetCategories',
  'recurringRules',
  'goals',
  'goalContributions',
  'plannedPurchases',
  'cardStatements',
  'reconciliations',
  'categoryKeywords',
  'smsAccountMap',
  'alertLog',
  'settings',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export type Row = Record<string, unknown>;
export type BackupData = Record<BackupTable, Row[]>;

export interface BackupCounts {
  accounts: number;
  categories: number;
  transactions: number;
  budgets: number;
  recurringRules: number;
  goals: number;
  plannedPurchases: number;
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  /** Epoch milliseconds. */
  createdAt: number;
  /** App version that wrote the file, for support. */
  appVersion: string;
  counts: BackupCounts;
  data: BackupData;
}

export function countsOf(data: BackupData): BackupCounts {
  return {
    accounts: data.accounts.length,
    categories: data.categories.length,
    transactions: data.transactions.length,
    budgets: data.budgets.length,
    recurringRules: data.recurringRules.length,
    goals: data.goals.length,
    plannedPurchases: data.plannedPurchases.length,
  };
}

export function buildSnapshot(data: BackupData, createdAt: number, appVersion: string): BackupFile {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    appVersion,
    counts: countsOf(data),
    data,
  };
}

export type SnapshotProblem =
  'not_json' | 'not_a_backup' | 'newer_version' | 'missing_table' | 'bad_rows' | 'bad_money';

export class SnapshotError extends Error {
  constructor(
    public readonly problem: SnapshotProblem,
    detail?: string,
  ) {
    super(detail ? `${problem}: ${detail}` : problem);
    this.name = 'SnapshotError';
  }
}

/** Columns that must hold integer minor units, per table. */
const MONEY_COLUMNS: Partial<Record<BackupTable, string[]>> = {
  accounts: ['openingBalance'],
  transactions: ['amount'],
  budgets: ['limit'],
  recurringRules: ['amount'],
  goals: ['targetAmount'],
  goalContributions: ['amount'],
  plannedPurchases: ['estimatedPrice'],
};

/** Upgrades an older file to the current shape. Version 1 is the first, so nothing to do yet. */
export function migrateSnapshot(file: BackupFile): BackupFile {
  return file;
}

/**
 * Checks that an object is a backup this app can restore, and returns it
 * upgraded to the current version. Throws SnapshotError otherwise.
 */
export function validateSnapshot(value: unknown): BackupFile {
  if (typeof value !== 'object' || value === null) throw new SnapshotError('not_a_backup');
  const file = value as Partial<BackupFile>;
  if (
    file.app !== BACKUP_APP_ID ||
    typeof file.schemaVersion !== 'number' ||
    typeof file.createdAt !== 'number'
  ) {
    throw new SnapshotError('not_a_backup');
  }
  if (file.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new SnapshotError('newer_version', String(file.schemaVersion));
  }
  const data = file.data as Partial<BackupData> | undefined;
  if (typeof data !== 'object' || data === null) throw new SnapshotError('not_a_backup');
  for (const table of BACKUP_TABLES) {
    const rows = data[table];
    if (rows === undefined) throw new SnapshotError('missing_table', table);
    if (
      !Array.isArray(rows) ||
      rows.some((r) => typeof r !== 'object' || r === null || Array.isArray(r))
    ) {
      throw new SnapshotError('bad_rows', table);
    }
    for (const column of MONEY_COLUMNS[table] ?? []) {
      for (const row of rows) {
        const amount = row[column];
        if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
          throw new SnapshotError('bad_money', `${table}.${column}`);
        }
      }
    }
  }
  const complete = data as BackupData;
  return migrateSnapshot({
    app: BACKUP_APP_ID,
    schemaVersion: file.schemaVersion,
    createdAt: file.createdAt,
    appVersion: typeof file.appVersion === 'string' ? file.appVersion : 'unknown',
    counts: countsOf(complete),
    data: complete,
  });
}

export function parseSnapshot(text: string): BackupFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SnapshotError('not_json');
  }
  return validateSnapshot(value);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "ledger-backup-20251113-142210.json" (local time, sortable). */
export function backupFileName(createdAt: number): string {
  const d = new Date(createdAt);
  return `ledger-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
}

export const BACKUPS_TO_KEEP = 7;

/** Which remote backups to delete so that only the newest `keep` remain. */
export function backupsToDelete<T extends { id: string; createdTime: number }>(
  files: readonly T[],
  keep = BACKUPS_TO_KEEP,
): T[] {
  return [...files].sort((a, b) => b.createdTime - a.createdTime).slice(keep);
}
