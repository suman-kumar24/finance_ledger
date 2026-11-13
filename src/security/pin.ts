/**
 * App-lock PIN. The PIN itself is never stored: a salted PBKDF2-SHA256 hash
 * is kept in the Android Keystore-backed secure store, outside the database
 * (so it is never part of a backup or export).
 */
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY = 'ledger.pin.v1';
const ITERATIONS = 20_000;
export const PIN_MIN = 4;
export const PIN_MAX = 8;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

export function hashPin(pin: string, salt: Uint8Array): string {
  return bytesToHex(pbkdf2(sha256, utf8ToBytes(pin), salt, { c: ITERATIONS, dkLen: 32 }));
}

/** Constant-time comparison of two hex strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function savePin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 to 8 digits');
  const salt = getRandomBytes(16);
  await SecureStore.setItemAsync(KEY, `${bytesToHex(salt)}:${hashPin(pin, salt)}`);
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) !== null;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(KEY);
  if (!stored) return false;
  const [saltHex, hash] = stored.split(':');
  if (!saltHex || !hash) return false;
  return safeEqual(hashPin(pin, hexToBytes(saltHex)), hash);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

/** Seconds to wait after a number of wrong attempts in a row. */
export function lockoutSeconds(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  return Math.min(300, 30 * 2 ** (failedAttempts - 5));
}
