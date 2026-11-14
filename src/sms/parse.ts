/**
 * Turns a bank, card, UPI or wallet alert into structured fields, entirely
 * on the device. Formats live in data/patterns.json, not in code.
 *
 * OTPs, promotions, payment requests, failed transactions, due reminders
 * and personal messages are rejected here and never reach storage.
 */
import { clampedDay, dayFromTimestamp, daysInMonth, type Day } from '../domain/dates';
import { parseAmount, type Minor } from '../domain/money';
import type { PaymentMethod } from '../domain/types';
import data from './data/patterns.json';
import type { ParsedSms, RawSms, SmsDirection, SmsInstrument, SmsVerdict } from './types';

interface PatternDef {
  id: string;
  regex: string;
  direction: SmsDirection;
  instrument: SmsInstrument;
  method: string | null;
}

interface Compiled extends PatternDef {
  re: RegExp;
}

const compile = (source: string) => new RegExp(source, 'i');

const IGNORE = data.ignore.map((rule) => ({ id: rule.id, re: compile(rule.regex) }));
const PATTERNS: Compiled[] = (data.patterns as PatternDef[]).map((p) => ({
  ...p,
  re: compile(p.regex),
}));
const G = {
  amount: compile(data.generic.amount),
  amountAfter: compile(data.generic.amountAfter),
  debit: compile(data.generic.debit),
  credit: compile(data.generic.credit),
  last4: compile(data.generic.last4),
  last4Plain: compile(data.generic.last4Plain),
  card: compile(data.generic.card),
  wallet: compile(data.generic.wallet),
  upi: compile(data.generic.upi),
  merchant: data.generic.merchant.map(compile),
  balance: compile(data.generic.balance),
  billPayment: compile(data.generic.billPayment),
};

export const PATTERN_IDS = PATTERNS.map((p) => p.id);
export const PATTERN_VERSION: number = data.version;

const METHODS: readonly string[] = ['upi', 'card', 'cash', 'netbanking', 'wallet', 'other'];

/** "VM-HDFCBK", "AD-SBIINB-S", "JK-ICICIT" -> "HDFCBK", "SBIINB", "ICICIT". */
export function cleanSender(address: string): string {
  const upper = address.trim().toUpperCase();
  const parts = upper.split('-').filter((p) => p.length > 0);
  if (parts.length >= 2 && (parts[0]?.length ?? 0) <= 2) parts.shift();
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && last !== undefined && last.length <= 1) parts.pop();
  return parts.join('-');
}

/** Banks send from alphanumeric sender ids; a plain phone number is a person. */
export function isPersonalSender(address: string): boolean {
  const compact = address.replace(/[\s()+-]/g, '');
  return /^\d{7,15}$/.test(compact);
}

function toMinor(text: string | undefined, decimals: number): Minor | null {
  if (!text) return null;
  return parseAmount(text.replace(/,/g, ''), decimals);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Reads the date written in an alert ("12/11/25", "12-Nov-25", "12Nov25",
 * "2025-11-12", "12 November 2025"). Indian alerts are day-first. Returns
 * null when the text is not a sensible date near the time of receipt.
 */
export function parseSmsDate(text: string | undefined, receivedAt: number): Day | null {
  if (!text) return null;
  const s = text.trim().toLowerCase();
  let year: number;
  let month: number;
  let day: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s))) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})[-/. ]?([a-z]{3,9})[-/. ]?(\d{2,4})/.exec(s))) {
    month = MONTHS.indexOf((m[2] ?? '').slice(0, 3)) + 1;
    [day, year] = [Number(m[1]), Number(m[3])];
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    return null;
  }
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const parsed = clampedDay(year, month, day);
  // An alert describes something that just happened: reject dates far from receipt.
  const received = dayFromTimestamp(receivedAt);
  const gap =
    Math.abs(Date.parse(`${parsed}T00:00:00Z`) - Date.parse(`${received}T00:00:00Z`)) / 86_400_000;
  return gap <= 7 ? parsed : null;
}

/** Tidies a merchant or VPA: trims reference numbers, bank suffixes and punctuation. */
export function cleanMerchant(text: string | undefined): string | null {
  if (!text) return null;
  let s = text
    .replace(/\s+/g, ' ')
    .replace(/\b(ref|refno|ref no|txn|upi ref|upi)[:.# ]*\d{6,}.*$/i, '')
    .replace(/\b\d{9,}\b/g, '')
    .replace(/^(vpa|upi|info)[:/ -]+/i, '')
    .replace(/[-/:;,. ]+$/g, '')
    .replace(/^[-/:;,. ]+/g, '')
    .trim();
  // UPI/P2M/123456/MERCHANT -> MERCHANT
  const segments = s
    .split('/')
    .filter((seg) => seg && !/^\d+$/.test(seg) && !/^(upi|p2m|p2a|p2p|imps|neft)$/i.test(seg));
  if (s.includes('/') && segments.length > 0) s = segments[segments.length - 1] ?? s;
  if (s.length < 2 || /^\d+$/.test(s) || /^(your|you|a\/c|account|the)$/i.test(s)) return null;
  return s.slice(0, 60);
}

function asMethod(value: string | null): PaymentMethod | null {
  return value !== null && METHODS.includes(value) ? (value as PaymentMethod) : null;
}

function build(
  sms: RawSms,
  fields: {
    direction: SmsDirection;
    amount: Minor;
    last4?: string;
    merchant?: string;
    date?: string;
    balance?: string;
    instrument: SmsInstrument;
    method: PaymentMethod | null;
    patternId: string;
  },
  decimals: number,
): ParsedSms {
  const body = sms.body;
  const instrument =
    fields.instrument !== 'unknown'
      ? fields.instrument
      : G.card.test(body)
        ? 'card'
        : G.wallet.test(body)
          ? 'wallet'
          : fields.last4
            ? 'account'
            : 'unknown';
  const method =
    fields.method ??
    (G.upi.test(body)
      ? 'upi'
      : instrument === 'card'
        ? 'card'
        : instrument === 'wallet'
          ? 'wallet'
          : null);
  return {
    direction: fields.direction,
    amount: fields.amount,
    last4: fields.last4 ? fields.last4.slice(-4) : null,
    merchant: cleanMerchant(fields.merchant),
    method,
    instrument,
    day: parseSmsDate(fields.date, sms.date) ?? dayFromTimestamp(sms.date),
    occurredAt: sms.date,
    balance: toMinor(fields.balance ?? G.balance.exec(body)?.groups?.balance, decimals),
    billPayment: G.billPayment.test(body),
    patternId: fields.patternId,
    sender: cleanSender(sms.address),
  };
}

/** Why a message is not a transaction alert, or null if it might be one. */
export function ignoreReason(sms: RawSms): string | null {
  if (isPersonalSender(sms.address)) return 'personal';
  const body = sms.body.replace(/\s+/g, ' ');
  for (const rule of IGNORE) {
    if (rule.re.test(body)) return rule.id;
  }
  return null;
}

export function classifySms(sms: RawSms, decimals = 2): SmsVerdict {
  const reason = ignoreReason(sms);
  if (reason) return { kind: 'ignored', reason };
  const body = sms.body.replace(/\s+/g, ' ').trim();
  const normalised = { ...sms, body };

  for (const pattern of PATTERNS) {
    const groups = pattern.re.exec(body)?.groups;
    if (!groups) continue;
    const amount = toMinor(groups.amount, decimals);
    if (amount === null || amount <= 0) continue;
    return {
      kind: 'transaction',
      parsed: build(
        normalised,
        {
          direction: pattern.direction,
          amount,
          last4: groups.last4,
          merchant: groups.merchant,
          date: groups.date,
          balance: groups.balance,
          instrument: pattern.instrument,
          method: asMethod(pattern.method),
          patternId: pattern.id,
        },
        decimals,
      ),
    };
  }

  // Generic fallback: needs an amount and exactly one clear direction.
  const debitAt = G.debit.exec(body)?.index ?? -1;
  const creditAt = G.credit.exec(body)?.index ?? -1;
  if (debitAt < 0 && creditAt < 0) return { kind: 'ignored', reason: 'no-transaction-word' };
  const amountText =
    G.amount.exec(body)?.groups?.amount ?? G.amountAfter.exec(body)?.groups?.amount;
  const amount = toMinor(amountText, decimals);
  if (amount === null || amount <= 0) return { kind: 'ignored', reason: 'no-amount' };
  // "debited ... and credited to X" describes one debit: the first word wins.
  const direction: SmsDirection =
    creditAt < 0 || (debitAt >= 0 && debitAt < creditAt) ? 'debit' : 'credit';
  let merchant: string | undefined;
  const order = direction === 'debit' ? [0, 1] : [2, 0];
  for (const index of order) {
    const found = G.merchant[index]?.exec(body)?.groups?.merchant;
    if (found && cleanMerchant(found)) {
      merchant = found;
      break;
    }
  }
  const dateText =
    /(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}[-/ ]?[a-z]{3}[-/ ]?\d{2,4})/i.exec(
      body,
    )?.[1];
  return {
    kind: 'transaction',
    parsed: build(
      normalised,
      {
        direction,
        amount,
        last4: G.last4.exec(body)?.groups?.last4 ?? G.last4Plain.exec(body)?.groups?.last4,
        merchant,
        date: dateText,
        instrument: 'unknown',
        method: null,
        patternId: 'generic',
      },
      decimals,
    ),
  };
}
