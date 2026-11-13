/**
 * Money utilities.
 *
 * Every amount in the app is an integer number of MINOR units (paise for INR,
 * cents for USD, whole yen for JPY). Floats never touch money: parsing works
 * on the digits of the string and formatting on the digits of the integer.
 */

/** An integer number of minor units. May be negative. */
export type Minor = number;

export type Grouping = 'indian' | 'western' | 'none';

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  /** Number of minor-unit digits (2 for INR, 0 for JPY). */
  decimals: number;
  defaultGrouping: Grouping;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, defaultGrouping: 'indian' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, defaultGrouping: 'western' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, defaultGrouping: 'western' },
  GBP: {
    code: 'GBP',
    symbol: '£',
    name: 'Pound Sterling',
    decimals: 2,
    defaultGrouping: 'western',
  },
  AED: { code: 'AED', symbol: 'AED ', name: 'UAE Dirham', decimals: 2, defaultGrouping: 'western' },
  SGD: {
    code: 'SGD',
    symbol: 'S$',
    name: 'Singapore Dollar',
    decimals: 2,
    defaultGrouping: 'western',
  },
  AUD: {
    code: 'AUD',
    symbol: 'A$',
    name: 'Australian Dollar',
    decimals: 2,
    defaultGrouping: 'western',
  },
  CAD: {
    code: 'CAD',
    symbol: 'C$',
    name: 'Canadian Dollar',
    decimals: 2,
    defaultGrouping: 'western',
  },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, defaultGrouping: 'western' },
  NPR: {
    code: 'NPR',
    symbol: 'रू ',
    name: 'Nepalese Rupee',
    decimals: 2,
    defaultGrouping: 'indian',
  },
  BDT: {
    code: 'BDT',
    symbol: '৳',
    name: 'Bangladeshi Taka',
    decimals: 2,
    defaultGrouping: 'indian',
  },
  LKR: {
    code: 'LKR',
    symbol: 'Rs ',
    name: 'Sri Lankan Rupee',
    decimals: 2,
    defaultGrouping: 'western',
  },
  PKR: {
    code: 'PKR',
    symbol: 'Rs ',
    name: 'Pakistani Rupee',
    decimals: 2,
    defaultGrouping: 'indian',
  },
};

export function currencyInfo(code: string): CurrencyInfo {
  return (
    CURRENCIES[code] ?? {
      code,
      symbol: `${code} `,
      name: code,
      decimals: 2,
      defaultGrouping: 'western',
    }
  );
}

export function isMinor(value: unknown): value is Minor {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Throws if the value is not a safe integer. Used at storage boundaries. */
export function assertMinor(value: unknown, label = 'amount'): Minor {
  if (!isMinor(value)) {
    throw new Error(`${label} must be a whole number of minor units, got ${String(value)}`);
  }
  return value;
}

const DEVANAGARI_ZERO = 0x0966;

/** Converts Devanagari digits (०-९) to ASCII digits. */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= DEVANAGARI_ZERO && code <= DEVANAGARI_ZERO + 9) {
      out += String(code - DEVANAGARI_ZERO);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Parses a human-typed amount into minor units without using floats.
 * Accepts "1200", "1,200", "1,20,000.50", "₹ 99.9", "-45", "०१२".
 * Extra decimal digits are rounded half-up. Returns null if not a number.
 */
export function parseAmount(input: string, decimals = 2): Minor | null {
  let s = normalizeDigits(input).trim();
  if (s === '') return null;
  let negative = false;
  // Strip currency symbols, letters and spaces around the number.
  const start = s.search(/[-+]?(\d|\.\d)/);
  if (start < 0 || /[-+]/.test(s.slice(0, start))) return null;
  s = s.slice(start).replace(/[^\d.]+$/, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(/[,\s_]/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const [wholeRaw = '', fracRaw = ''] = s.split('.');
  const whole = wholeRaw === '' ? '0' : wholeRaw;
  let frac = fracRaw;
  let roundUp = false;
  if (frac.length > decimals) {
    roundUp = Number(frac.charAt(decimals)) >= 5;
    frac = frac.slice(0, decimals);
  }
  frac = frac.padEnd(decimals, '0');
  const digits = (whole + frac).replace(/^0+(?=\d)/, '');
  if (digits.length > 15) return null; // beyond safe integer range
  let value = Number(digits);
  if (roundUp) value += 1;
  if (!Number.isSafeInteger(value)) return null;
  return negative && value !== 0 ? -value : value;
}

/** Builds minor units from a whole-unit integer and a minor remainder. */
export function fromMajor(major: number, minorPart = 0, decimals = 2): Minor {
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minorPart)) {
    throw new Error('fromMajor expects integers');
  }
  return assertMinor(major * 10 ** decimals + (major < 0 ? -minorPart : minorPart));
}

/** Groups the digits of a non-negative integer string. */
export function groupDigits(digits: string, grouping: Grouping): string {
  if (grouping === 'none' || digits.length <= 3) return digits;
  if (grouping === 'western') {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  // Indian: last three digits, then groups of two (12,34,567).
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

export interface FormatOptions {
  currency?: string;
  grouping?: Grouping;
  /** Show the currency symbol (default true). */
  symbol?: boolean;
  /** 'auto' hides ".00" for whole amounts; 'always' shows all decimals; 'never' rounds. */
  fraction?: 'auto' | 'always' | 'never';
  /** 'auto' shows "-" for negatives; 'always' also shows "+"; 'never' shows the magnitude. */
  sign?: 'auto' | 'always' | 'never';
}

/** Splits minor units into sign, whole digits and fraction digits (all exact). */
export function splitMinor(
  amount: Minor,
  decimals: number,
): { negative: boolean; whole: string; fraction: string } {
  assertMinor(amount);
  const negative = amount < 0;
  const digits = String(Math.abs(amount)).padStart(decimals + 1, '0');
  return {
    negative,
    whole: decimals === 0 ? digits : digits.slice(0, -decimals),
    fraction: decimals === 0 ? '' : digits.slice(-decimals),
  };
}

/** Formats minor units for display, e.g. 12345650 -> "₹1,23,456.50". */
export function formatMoney(amount: Minor, options: FormatOptions = {}): string {
  const info = currencyInfo(options.currency ?? 'INR');
  const grouping = options.grouping ?? info.defaultGrouping;
  const fractionMode = options.fraction ?? 'auto';
  const signMode = options.sign ?? 'auto';
  let value = amount;
  if (fractionMode === 'never' && info.decimals > 0) {
    value = roundToMajor(amount, info.decimals);
  }
  const parts = splitMinor(value, info.decimals);
  let body = groupDigits(parts.whole, grouping);
  const showFraction =
    info.decimals > 0 &&
    (fractionMode === 'always' || (fractionMode === 'auto' && Number(parts.fraction) !== 0));
  if (showFraction) body += `.${parts.fraction}`;
  let sign = '';
  if (signMode !== 'never') {
    if (parts.negative) sign = '-';
    else if (signMode === 'always' && value > 0) sign = '+';
  }
  const symbol = options.symbol === false ? '' : info.symbol;
  return `${sign}${symbol}${body}`;
}

/** Rounds minor units to the nearest whole major unit (half away from zero). */
export function roundToMajor(amount: Minor, decimals = 2): Minor {
  const unit = 10 ** decimals;
  const abs = Math.abs(amount);
  const rounded = Math.floor((abs + unit / 2) / unit) * unit;
  return amount < 0 ? -rounded : rounded;
}

interface CompactStep {
  /** Size of the unit in MAJOR units. */
  size: number;
  suffix: string;
}

const INDIAN_STEPS: CompactStep[] = [
  { size: 10_000_000, suffix: 'Cr' },
  { size: 100_000, suffix: 'L' },
  { size: 1_000, suffix: 'K' },
];
const WESTERN_STEPS: CompactStep[] = [
  { size: 1_000_000_000, suffix: 'B' },
  { size: 1_000_000, suffix: 'M' },
  { size: 1_000, suffix: 'K' },
];

/**
 * Short form for chart axes and tight spaces: "₹1.2L", "₹3.45Cr", "$1.5M".
 * Uses integer maths; keeps at most two significant decimals, trimmed.
 */
export function formatCompact(amount: Minor, options: FormatOptions = {}): string {
  const info = currencyInfo(options.currency ?? 'INR');
  const grouping = options.grouping ?? info.defaultGrouping;
  const steps = grouping === 'indian' ? INDIAN_STEPS : WESTERN_STEPS;
  const unit = 10 ** info.decimals;
  const abs = Math.abs(amount);
  const symbol = options.symbol === false ? '' : info.symbol;
  const sign = amount < 0 && options.sign !== 'never' ? '-' : '';
  for (const step of steps) {
    const stepMinor = step.size * unit;
    if (abs >= stepMinor) {
      // hundredths of the step, rounded half-up
      const hundredths = Math.floor((abs * 100 + stepMinor / 2) / stepMinor);
      const whole = Math.floor(hundredths / 100);
      const frac = String(hundredths % 100)
        .padStart(2, '0')
        .replace(/0+$/, '');
      return `${sign}${symbol}${whole}${frac ? `.${frac}` : ''}${step.suffix}`;
    }
  }
  return formatMoney(amount, { ...options, fraction: 'never' });
}

export function sum(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) total += v;
  return assertMinor(total, 'sum');
}

/**
 * amount * numerator / denominator, rounded half away from zero, exact for
 * values in the safe-integer range (uses BigInt internally).
 */
export function mulDiv(amount: Minor, numerator: number, denominator: number): Minor {
  if (denominator === 0) throw new Error('mulDiv: division by zero');
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error('mulDiv expects integer ratio');
  }
  const n = BigInt(amount) * BigInt(numerator);
  const d = BigInt(denominator);
  const negative = n < 0n !== d < 0n;
  const absN = n < 0n ? -n : n;
  const absD = d < 0n ? -d : d;
  const q = (absN * 2n + absD) / (absD * 2n);
  const result = Number(negative ? -q : q);
  return assertMinor(result, 'mulDiv result');
}

/** Splits an amount into `parts` near-equal integers that add up exactly. */
export function allocate(amount: Minor, parts: number): Minor[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new Error('allocate: parts must be >= 1');
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/**
 * Ratio of part to whole as a plain number (for progress bars and percent
 * labels only, never for money). Returns 0 when whole is 0.
 */
export function ratio(part: Minor, whole: Minor): number {
  if (whole === 0) return 0;
  return part / whole;
}

/** Whole-number percentage, floored, e.g. 799/1000 -> 79. */
export function percentFloor(part: Minor, whole: Minor): number {
  if (whole <= 0) return 0;
  return Number((BigInt(part) * 100n) / BigInt(whole));
}

/** Converts minor units to a plain decimal string ("1234.50") for CSV. */
export function toDecimalString(amount: Minor, decimals = 2): string {
  const parts = splitMinor(amount, decimals);
  return `${parts.negative ? '-' : ''}${parts.whole}${decimals > 0 ? `.${parts.fraction}` : ''}`;
}
