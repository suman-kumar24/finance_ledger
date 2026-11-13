/**
 * Finds amounts in tokenised text: digits ("1,200", "1.2k", "12 lakh"),
 * English words ("two hundred fifty"), Hindi words in Devanagari
 * ("चार सौ") and romanised Hindi ("pachpan hazaar ikyavan"), with paise.
 *
 * All arithmetic is on integers in hundredths, so 1.2k is exactly 1200.00.
 */
import {
  CURRENCY_WORDS,
  ENGLISH_UNITS,
  FRACTION_MODIFIERS,
  FRACTION_UNITS,
  HINDI_UNITS,
  MULTIPLIERS,
  PAISE_WORDS,
} from './data/numbers';
import { normalizeDevanagari, romanKey, type Token } from './tokens';

type WordKind = 'unit' | 'fraction' | 'modifier' | 'multiplier';
interface WordInfo {
  kind: WordKind;
  /** Units and multipliers: plain value. Fractions and modifiers: hundredths. */
  value: number;
  english?: boolean;
}

const WORDS = new Map<string, WordInfo>();
function add(
  kind: WordKind,
  value: number,
  devanagari: string[],
  roman: string[],
  english = false,
) {
  for (const word of devanagari) WORDS.set(normalizeDevanagari(word), { kind, value });
  for (const word of roman) WORDS.set(romanKey(word), { kind, value, english });
}
for (const [value, dev, roman] of HINDI_UNITS) add('unit', value, dev, roman);
for (const [word, value] of Object.entries(ENGLISH_UNITS)) add('unit', value, [], [word], true);
for (const [value, dev, roman] of MULTIPLIERS) add('multiplier', value, dev, roman);
for (const [value, dev, roman] of FRACTION_UNITS) add('fraction', value, dev, roman);
for (const [value, dev, roman] of FRACTION_MODIFIERS) add('modifier', value, dev, roman);

const CURRENCY = new Set(CURRENCY_WORDS);
const PAISE = new Set(PAISE_WORDS);
const DIGITS_RE = /^\d+(\.\d+)?$/;
const SUFFIX_RE = /^(\d+(?:\.\d+)?)(k|l|lac|lakh|cr|crore|m)$/;
const SUFFIX_VALUE: Record<string, number> = {
  k: 1_000,
  l: 100_000,
  lac: 100_000,
  lakh: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  m: 1_000_000,
};

/** English words that look like romanised Hindi numbers and must not be read as one. */
const NOT_NUMBERS = new Set(['so', 'do', 'bis', 'tin', 'sat', 'bara', 'tera', 'the']);

function lookup(token: Token): WordInfo | null {
  if (DIGITS_RE.test(token.text)) return null;
  const direct = WORDS.get(token.text);
  if (direct) return direct;
  if (/^[a-z]+$/.test(token.text)) return WORDS.get(romanKey(token.text)) ?? null;
  return null;
}

/** "12.5" -> 1250 hundredths, exactly. */
function digitsToHundredths(text: string): number {
  const [whole = '0', frac = ''] = text.split('.');
  const two = (frac + '00').slice(0, 2);
  const roundUp = frac.length > 2 && Number(frac.charAt(2)) >= 5 ? 1 : 0;
  return Number(whole) * 100 + Number(two) + roundUp;
}

export interface NumberMatch {
  start: number;
  /** Exclusive. */
  end: number;
  /** Value in hundredths of the major unit. */
  hundredths: number;
  /** A currency word or symbol sits next to the number. */
  hasCurrency: boolean;
  /** True when the number came from an ambiguous word such as "do" or "so". */
  weak: boolean;
}

/** True when the token at `j` is a number whose own multiplier is not smaller than `limit`. */
function startsBiggerGroup(tokens: Token[], j: number, limit: number): boolean {
  const token = tokens[j];
  const next = tokens[j + 1];
  if (!token || !next || next.used) return false;
  const isNumber = DIGITS_RE.test(token.text) || lookup(token)?.kind === 'unit';
  const nextInfo = lookup(next);
  return (
    isNumber && nextInfo?.kind === 'multiplier' && nextInfo.value !== 100 && nextInfo.value >= limit
  );
}

function parseAt(tokens: Token[], start: number): NumberMatch | null {
  let total = 0;
  let current: number | null = null; // hundredths
  let last: 'none' | 'digit' | 'unit' | 'tens' | 'hundred' | 'afterHundred' | 'mult' | 'modifier' =
    'none';
  let lastMult = Infinity;
  let modifier = 0;
  let j = start;
  let consumed = 0;
  let weak = false;

  for (; j < tokens.length; j += 1) {
    const token = tokens[j];
    if (!token || token.used) break;
    const text = token.text;

    const suffix = SUFFIX_RE.exec(text);
    if (suffix) {
      if (last !== 'none' && last !== 'mult') break;
      const size = SUFFIX_VALUE[suffix[2] ?? 'k'] ?? 1000;
      if (size >= lastMult) break;
      total += digitsToHundredths(suffix[1] ?? '0') * size;
      last = 'mult';
      lastMult = size;
      consumed += 1;
      continue;
    }

    // "5 lakh 7 lakh" is two amounts: do not pull the 7 into the first.
    if (last === 'mult' && startsBiggerGroup(tokens, j, lastMult)) break;

    if (DIGITS_RE.test(text)) {
      if (last !== 'none' && last !== 'mult' && last !== 'hundred') break;
      const value = digitsToHundredths(text);
      // After a multiplier only a smaller number may follow ("2 lakh 50 hazaar").
      if (last !== 'none' && value >= (last === 'hundred' ? 100 : lastMult) * 100) break;
      current = (current ?? 0) + value;
      last = last === 'hundred' ? 'afterHundred' : 'digit';
      consumed += 1;
      continue;
    }

    if (text === 'and' || text === 'aur' || text === 'और') {
      // "two hundred and fifty"
      const next = tokens[j + 1];
      const nextInfo = next && !next.used ? lookup(next) : null;
      if ((last === 'hundred' || last === 'mult') && nextInfo?.kind === 'unit') continue;
      break;
    }

    const info = lookup(token);
    if (!info) break;
    const ambiguous = NOT_NUMBERS.has(text);

    if (info.kind === 'modifier') {
      if (last !== 'none' && last !== 'mult') break;
      modifier = info.value;
      last = 'modifier';
      consumed += 1;
      continue;
    }

    if (info.kind === 'fraction') {
      if (last !== 'none' && last !== 'mult') break;
      current = info.value;
      last = 'unit';
      consumed += 1;
      continue;
    }

    if (info.kind === 'unit') {
      const value = info.value * 100;
      if (last === 'none' || last === 'mult' || last === 'modifier') {
        // A bare ambiguous word ("do", "so") does not start a number on its own.
        if (ambiguous && last === 'none') {
          const next = tokens[j + 1];
          const nextInfo = next && !next.used ? lookup(next) : null;
          if (nextInfo?.kind !== 'multiplier') break;
          weak = false;
        }
        current = value + modifier;
        modifier = 0;
        last = info.english && info.value >= 20 ? 'tens' : 'unit';
      } else if (last === 'hundred') {
        current = (current ?? 0) + value;
        last = info.english && info.value >= 20 ? 'tens' : 'afterHundred';
      } else if (last === 'tens' && info.english && info.value < 10) {
        current = (current ?? 0) + value; // "twenty five"
        last = 'afterHundred';
      } else {
        break;
      }
      consumed += 1;
      continue;
    }

    // multiplier
    if (info.value === 100) {
      if (last === 'hundred' || last === 'afterHundred' || last === 'tens') break;
      if (ambiguous && last === 'none') break; // a lone "so"
      if (last === 'modifier') {
        current = 100 + modifier; // "sawa sau" = 1.25 x 100
        modifier = 0;
      }
      if (current !== null && current >= 100 * 100) break;
      current = (current ?? 100) * 100;
      last = 'hundred';
    } else {
      if (info.value >= lastMult) break;
      if (last === 'modifier') {
        current = 100 + modifier;
        modifier = 0;
      }
      total += (current ?? 100) * info.value;
      current = null;
      last = 'mult';
      lastMult = info.value;
    }
    consumed += 1;
  }

  if (consumed === 0 || last === 'modifier') return null;
  const hundredths = total + (current ?? 0);
  if (!Number.isSafeInteger(hundredths) || hundredths < 0) return null;
  return { start, end: j, hundredths, hasCurrency: false, weak };
}

function isCurrency(token: Token | undefined): boolean {
  return token !== undefined && !token.used && CURRENCY.has(token.text);
}

function isPaise(token: Token | undefined): boolean {
  return token !== undefined && !token.used && PAISE.has(token.text);
}

/** Every number in the text, left to right. Does not mark tokens as used. */
export function findNumbers(tokens: Token[]): NumberMatch[] {
  const matches: NumberMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token.used) {
      i += 1;
      continue;
    }
    const match = parseAt(tokens, i);
    if (!match) {
      i += 1;
      continue;
    }
    let end = match.end;
    let hasCurrency = isCurrency(tokens[match.start - 1]);

    if (isPaise(tokens[end])) {
      // "50 paise" on its own
      match.hundredths = Math.round(match.hundredths / 100);
      end += 1;
      hasCurrency = true;
    } else {
      if (isCurrency(tokens[end])) {
        hasCurrency = true;
        end += 1;
      }
      // "... rupees [and] 50 paise"
      let k = end;
      const joiner = tokens[k];
      if (joiner && !joiner.used && ['and', 'aur', 'और'].includes(joiner.text)) k += 1;
      const paise = parseAt(tokens, k);
      if (paise && isPaise(tokens[paise.end]) && paise.hundredths < 100 * 100) {
        match.hundredths += Math.round(paise.hundredths / 100);
        end = paise.end + 1;
        hasCurrency = true;
      }
    }
    matches.push({ ...match, end, hasCurrency });
    i = end;
  }
  return matches;
}

/** Converts hundredths to minor units for a currency with `decimals` digits. */
export function hundredthsToMinor(hundredths: number, decimals: number): number {
  if (decimals === 2) return hundredths;
  if (decimals < 2) return Math.round(hundredths / 10 ** (2 - decimals));
  return hundredths * 10 ** (decimals - 2);
}

/** Convenience for tests and tools: the value of a phrase that is only a number. */
export function parseNumberPhrase(tokens: Token[]): number | null {
  const matches = findNumbers(tokens);
  return matches.length === 1 && matches[0] ? matches[0].hundredths : null;
}
