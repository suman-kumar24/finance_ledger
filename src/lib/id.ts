import { randomUUID } from 'expo-crypto';

/** A new random identifier for a database row. */
export function newId(): string {
  return randomUUID();
}
