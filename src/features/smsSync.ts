import { importSms, type ImportStats } from '@/data/sms';
import { getSettings } from '@/data/settings';
import type { Db } from '@/db/types';
import { listenForSms, readInbox, smsSupported } from '@/sms/native';

/** How far back the first scan looks. */
export const FIRST_SCAN_DAYS = 30;

/** Reads new inbox messages and files bank alerts for review. Does nothing unless the user opted in. */
export async function scanSms(db: Db, now = Date.now()): Promise<ImportStats | null> {
  const settings = getSettings(db);
  if (!settings.smsEnabled || !smsSupported()) return null;
  const since = settings.smsLastScanAt ?? now - FIRST_SCAN_DAYS * 86_400_000;
  const messages = await readInbox(since);
  return importSms(db, messages, now);
}

/** While the app is open, files new bank alerts as they arrive (if the user turned that on). */
export function startSmsListener(db: Db): () => void {
  const settings = getSettings(db);
  if (!settings.smsEnabled || !settings.smsListenNew || !smsSupported()) return () => undefined;
  return listenForSms((sms) => {
    importSms(db, [sms]);
  });
}
