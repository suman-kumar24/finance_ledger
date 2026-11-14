/**
 * De-duplication for imported alerts (brief §7).
 *
 * 1. By hash: the same SMS is never imported twice.
 * 2. By content: an alert that matches an entry already in the ledger (same
 *    amount, same account when known, within a day or two) is flagged, so a
 *    purchase the user typed in by hand is not added again. The same test
 *    catches the bank and the UPI app both texting about one payment.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { diffDays, type Day } from '../domain/dates';
import type { Minor } from '../domain/money';
import type { TransactionType } from '../domain/types';
import type { RawSms, SmsDirection } from './types';

/** A stable fingerprint of a message. Only this hash is stored, never the text. */
export function smsHash(sms: RawSms): string {
  const body = sms.body.replace(/\s+/g, ' ').trim().toLowerCase();
  return bytesToHex(sha256(utf8ToBytes(`${sms.address.trim().toUpperCase()}|${sms.date}|${body}`)));
}

export const DUPLICATE_WINDOW_DAYS = 1;

export interface ExistingEntry {
  id: string;
  type: TransactionType;
  amount: Minor;
  day: Day;
  accountId: string;
  toAccountId: string | null;
}

export interface Candidate {
  direction: SmsDirection;
  amount: Minor;
  day: Day;
  /** The account the last 4 digits map to, when known. */
  accountId: string | null;
}

const OUTGOING: TransactionType[] = ['expense', 'transfer', 'card_payment'];
const INCOMING: TransactionType[] = ['income', 'refund'];

/** Whether an existing entry moves money the same way the alert describes, for that account. */
function sameDirection(entry: ExistingEntry, candidate: Candidate): boolean {
  if (candidate.accountId !== null && entry.toAccountId === candidate.accountId) {
    // Money arriving in this account (a transfer in, or a card bill payment).
    return candidate.direction === 'credit';
  }
  if (entry.type === 'adjustment')
    return candidate.direction === (entry.amount < 0 ? 'debit' : 'credit');
  return candidate.direction === 'debit'
    ? OUTGOING.includes(entry.type)
    : INCOMING.includes(entry.type);
}

/** The existing entry this alert most likely repeats, or null. */
export function findDuplicate(
  candidate: Candidate,
  existing: readonly ExistingEntry[],
  windowDays = DUPLICATE_WINDOW_DAYS,
): ExistingEntry | null {
  let best: ExistingEntry | null = null;
  let bestGap = Infinity;
  for (const entry of existing) {
    if (Math.abs(entry.amount) !== candidate.amount) continue;
    const gap = Math.abs(diffDays(entry.day, candidate.day));
    if (gap > windowDays) continue;
    if (
      candidate.accountId !== null &&
      entry.accountId !== candidate.accountId &&
      entry.toAccountId !== candidate.accountId
    ) {
      continue;
    }
    if (!sameDirection(entry, candidate)) continue;
    if (gap < bestGap) {
      best = entry;
      bestGap = gap;
    }
  }
  return best;
}
