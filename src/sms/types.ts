import type { Day } from '../domain/dates';
import type { Minor } from '../domain/money';
import type { PaymentMethod } from '../domain/types';

/** A message as read from the phone. Held in memory only; never stored. */
export interface RawSms {
  /** Sender id, e.g. "VM-HDFCBK", or a phone number for personal messages. */
  address: string;
  body: string;
  /** When the message was received (epoch milliseconds). */
  date: number;
}

export type SmsDirection = 'debit' | 'credit';
export type SmsInstrument = 'account' | 'card' | 'wallet' | 'unknown';

/** The structured fields kept from a bank alert. The message text is not among them. */
export interface ParsedSms {
  direction: SmsDirection;
  amount: Minor;
  last4: string | null;
  merchant: string | null;
  method: PaymentMethod | null;
  instrument: SmsInstrument;
  day: Day;
  occurredAt: number;
  balance: Minor | null;
  /** Looks like a credit card bill payment rather than spending or income. */
  billPayment: boolean;
  patternId: string;
  /** Sender with the operator prefix removed, e.g. "HDFCBK". */
  sender: string;
}

export type SmsVerdict =
  { kind: 'transaction'; parsed: ParsedSms } | { kind: 'ignored'; reason: string };
