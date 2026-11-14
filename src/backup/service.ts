/**
 * Backup and restore to the user's own Google Drive.
 */
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';

import { exportSnapshot, restoreSnapshot } from '@/data/backup';
import { getSettings, updateSettings } from '@/data/settings';
import type { Db } from '@/db/types';

import { connectGoogle, disconnectGoogle, getAccessToken } from './drive/auth';
import { createDriveClient, type DriveClient, type DriveFile } from './drive/client';
import { decryptText, encryptText, isEncryptedFile, MIN_PASSPHRASE_LENGTH } from './format/crypto';
import { backupFileName, backupsToDelete, parseSnapshot, type BackupFile } from './format/snapshot';

const PASSPHRASE_KEY = 'ledger.backup.passphrase.v1';
export const AUTO_BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;

export const appVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

let client: DriveClient | null = null;
function drive(): DriveClient {
  client ??= createDriveClient(getAccessToken);
  return client;
}

/** Signs in to Google and switches backup on. Returns the account email, or null if cancelled. */
export async function connectBackup(db: Db): Promise<string | null> {
  const email = await connectGoogle();
  if (email === null) return null;
  updateSettings(db, { backupEnabled: true, backupAccount: email });
  return email;
}

/** Switches backup off and withdraws access. Existing backups stay in the user's Drive. */
export async function disconnectBackup(db: Db): Promise<void> {
  await disconnectGoogle();
  await SecureStore.deleteItemAsync(PASSPHRASE_KEY);
  updateSettings(db, {
    backupEnabled: false,
    backupAuto: false,
    backupEncrypted: false,
    backupAccount: null,
  });
}

/**
 * Sets (or, with null, removes) the passphrase used to encrypt backups. It
 * is kept in the Keystore-backed secure store so automatic backups can use
 * it; it is never written to the database or to a backup.
 */
export async function setBackupPassphrase(db: Db, passphrase: string | null): Promise<void> {
  if (passphrase === null) {
    await SecureStore.deleteItemAsync(PASSPHRASE_KEY);
    updateSettings(db, { backupEncrypted: false });
    return;
  }
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error('Passphrase is too short');
  await SecureStore.setItemAsync(PASSPHRASE_KEY, passphrase);
  updateSettings(db, { backupEncrypted: true });
}

/** The text of a backup file for the current data, encrypted if a passphrase is set. */
export async function buildBackupText(
  db: Db,
  now = Date.now(),
): Promise<{ name: string; text: string }> {
  const snapshot = exportSnapshot(db, appVersion(), now);
  const plain = JSON.stringify(snapshot);
  const passphrase = getSettings(db).backupEncrypted
    ? await SecureStore.getItemAsync(PASSPHRASE_KEY)
    : null;
  const text = passphrase
    ? JSON.stringify(await encryptText(plain, passphrase, now, getRandomBytes))
    : plain;
  return { name: backupFileName(now), text };
}

/** Uploads a backup now and removes all but the newest seven. */
export async function backupNow(db: Db, now = Date.now()): Promise<DriveFile> {
  const { name, text } = await buildBackupText(db, now);
  const uploaded = await drive().upload(name, text);
  updateSettings(db, { lastBackupAt: now, lastExportAt: now });
  try {
    for (const old of backupsToDelete(await drive().list())) await drive().remove(old.id);
  } catch {
    // Pruning is best-effort; the new backup is already safe.
  }
  return uploaded;
}

export function listBackups(): Promise<DriveFile[]> {
  return drive().list();
}

export class PassphraseNeededError extends Error {
  constructor() {
    super('This backup is encrypted');
    this.name = 'PassphraseNeededError';
  }
}

/** Reads backup text (plain or encrypted) into a validated backup, without changing any data. */
export async function readBackupText(
  text: string,
  passphrase?: string | null,
): Promise<BackupFile> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return parseSnapshot(text); // throws the right "not JSON" error
  }
  if (isEncryptedFile(value)) {
    const secret = passphrase ?? (await SecureStore.getItemAsync(PASSPHRASE_KEY));
    if (!secret) throw new PassphraseNeededError();
    return parseSnapshot(await decryptText(value, secret));
  }
  return parseSnapshot(text);
}

/** Downloads a backup and returns it for the "date and counts" confirmation. */
export async function fetchBackup(id: string, passphrase?: string | null): Promise<BackupFile> {
  return readBackupText(await drive().download(id), passphrase);
}

/** Replaces all data with a backup the user has confirmed. */
export function applyBackup(db: Db, file: BackupFile): void {
  restoreSnapshot(db, file);
}

/** True when a daily automatic backup should run now: enabled, a day has passed, and on Wi-Fi. */
export async function autoBackupDue(db: Db, now = Date.now()): Promise<boolean> {
  const settings = getSettings(db);
  if (!settings.backupEnabled || !settings.backupAuto) return false;
  if (settings.lastBackupAt !== null && now - settings.lastBackupAt < AUTO_BACKUP_EVERY_MS)
    return false;
  const state = await Network.getNetworkStateAsync();
  return state.isConnected === true && state.type === Network.NetworkStateType.WIFI;
}

/** Runs the daily backup if it is due. Never throws: a failed backup is retried next time. */
export async function runAutoBackup(db: Db, now = Date.now()): Promise<boolean> {
  try {
    if (!(await autoBackupDue(db, now))) return false;
    await backupNow(db, now);
    return true;
  } catch {
    return false;
  }
}
