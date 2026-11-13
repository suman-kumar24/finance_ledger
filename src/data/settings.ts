import { eq } from 'drizzle-orm';

import { settings as settingsTable } from '@/db/schema';
import type { Db } from '@/db/types';
import type { Grouping } from '@/domain/money';

import { emitChange } from './bus';

export type Language = 'en' | 'hi';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  onboarded: boolean;
  language: Language;
  currency: string;
  grouping: Grouping;
  /** Day of month a budget period starts (1 = calendar month). */
  monthStartDay: number;
  theme: ThemeChoice;
  lockEnabled: boolean;
  biometricEnabled: boolean;
  /** FLAG_SECURE: hide the app in recents and block screenshots. */
  screenSecure: boolean;
  budgetWarningPercent: number;
  notifyBudgets: boolean;
  notifyBills: boolean;
  notifyRecurring: boolean;
  dailyReminder: boolean;
  /** "HH:MM" local time for the end-of-day reminder. */
  dailyReminderTime: string;
  exportReminder: boolean;
  lastExportAt: number | null;
  backupEnabled: boolean;
  backupAuto: boolean;
  backupEncrypted: boolean;
  backupAccount: string | null;
  lastBackupAt: number | null;
  smsEnabled: boolean;
  smsListenNew: boolean;
  smsLastScanAt: number | null;
  installedAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  language: 'en',
  currency: 'INR',
  grouping: 'indian',
  monthStartDay: 1,
  theme: 'system',
  lockEnabled: false,
  biometricEnabled: false,
  screenSecure: true,
  budgetWarningPercent: 80,
  notifyBudgets: true,
  notifyBills: true,
  notifyRecurring: true,
  dailyReminder: false,
  dailyReminderTime: '21:00',
  exportReminder: true,
  lastExportAt: null,
  backupEnabled: false,
  backupAuto: false,
  backupEncrypted: false,
  backupAccount: null,
  lastBackupAt: null,
  smsEnabled: false,
  smsListenNew: false,
  smsLastScanAt: null,
  installedAt: null,
};

/** Settings that describe this device rather than the user's data; never restored from a backup. */
export const DEVICE_ONLY_SETTINGS: readonly (keyof Settings)[] = [
  'lockEnabled',
  'biometricEnabled',
  'backupEnabled',
  'backupAuto',
  'backupEncrypted',
  'backupAccount',
  'lastBackupAt',
  'smsEnabled',
  'smsListenNew',
  'smsLastScanAt',
  'installedAt',
];

export function getSettings(db: Db): Settings {
  const rows = db.select().from(settingsTable).all();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      // keep the default for a corrupt value
    }
  }
  return out as unknown as Settings;
}

export function updateSettings(db: Db, patch: Partial<Settings>): void {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
      const json = JSON.stringify(value);
      tx.insert(settingsTable)
        .values({ key, value: json })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: json } })
        .run();
    }
  });
  emitChange();
}

export function clearSetting(db: Db, key: keyof Settings): void {
  db.delete(settingsTable).where(eq(settingsTable.key, key)).run();
  emitChange();
}
