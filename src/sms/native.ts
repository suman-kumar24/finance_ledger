/**
 * The only file that touches the native SMS module. Everything else in
 * src/sms is pure TypeScript.
 */
import { PermissionsAndroid, Platform } from 'react-native';

import { LedgerSms } from '../../modules/ledger-sms';
import type { RawSms } from './types';

/** True only on the `full` Android build, whose manifest declares READ_SMS. */
export function smsSupported(): boolean {
  if (Platform.OS !== 'android' || LedgerSms === null) return false;
  try {
    return LedgerSms.isSupported();
  } catch {
    return false;
  }
}

export function smsListenSupported(): boolean {
  if (!smsSupported() || LedgerSms === null) return false;
  try {
    return LedgerSms.canListen();
  } catch {
    return false;
  }
}

export async function hasSmsPermission(): Promise<boolean> {
  if (!smsSupported()) return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
}

/** Asks for READ_SMS (and RECEIVE_SMS when `listen`). Call only after explaining why. */
export async function requestSmsPermission(listen: boolean): Promise<boolean> {
  if (!smsSupported()) return false;
  const read = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (read !== PermissionsAndroid.RESULTS.GRANTED) return false;
  if (listen && smsListenSupported()) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
  }
  return true;
}

/** Reads inbox messages newer than `sinceMs`. They are returned to the caller and not stored. */
export async function readInbox(sinceMs: number, limit = 2000): Promise<RawSms[]> {
  if (LedgerSms === null || !(await hasSmsPermission())) return [];
  return LedgerSms.readInbox(sinceMs, limit);
}

/** Delivers new messages while the app is open. Returns a function that stops it. */
export function listenForSms(onMessage: (sms: RawSms) => void): () => void {
  if (LedgerSms === null || !smsListenSupported()) return () => undefined;
  const subscription = LedgerSms.addListener('onSmsReceived', onMessage);
  LedgerSms.startListening();
  return () => {
    subscription.remove();
    LedgerSms?.stopListening();
  };
}
