/**
 * Tokenising and spelling normalisation for the entry parser.
 */
import { normalizeDigits } from '../domain/money';

export interface Token {
  /** Lower-cased text. */
  text: string;
  /** Text as typed, for building a payee name. */
  raw: string;
  /** Set once an extractor has claimed the token. */
  used: boolean;
}

/** Normalises Devanagari spelling variants (nukta, chandrabindu, zero-width joiners). */
export function normalizeDevanagari(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‌‍]/g, '')
    .replace(/़/g, '') // nukta
    .replace(/ँ/g, 'ं'); // chandrabindu -> anusvara
}

/**
 * A spelling key for romanised Hindi, so that "chaar"/"char",
 * "hazaar"/"hazar" and "ikyawan"/"ikyavan" compare equal.
 */
export function romanKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/ph/g, 'f')
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/(.)\1+/g, '$1')
    .replace(/([aeiou])h$/, '$1');
}

const SPLIT_RE = /[\s,;!?()[\]{}"“”‘’|]+/;

/** Splits text into tokens, separating currency marks and units from digits. */
export function tokenize(input: string): Token[] {
  const text = normalizeDevanagari(normalizeDigits(input))
    // 1,200 -> 1200 (only commas between digits)
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/₹/g, ' ₹ ')
    .replace(/\/-/g, ' ')
    .replace(/\brs\.?\s*(?=\d)/gi, 'rs ')
    .replace(/(\d)(rs|rupees|rupee|inr)\b/gi, '$1 $2')
    .replace(/।/g, ' ');
  const out: Token[] = [];
  for (const part of text.split(SPLIT_RE)) {
    // Keep dots inside numbers and dates; trim them elsewhere.
    const raw = part.replace(/^[.:'`*#+-]+|[.:'`*]+$/g, '');
    if (raw === '') continue;
    out.push({ text: raw.toLowerCase(), raw, used: false });
  }
  return out;
}

export function isDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}

/** "corner shop" -> "Corner Shop"; Devanagari is left unchanged. */
export function titleCase(text: string): string {
  return text.replace(
    /(^|\s)([a-z])/g,
    (_m, space: string, ch: string) => space + ch.toUpperCase(),
  );
}
