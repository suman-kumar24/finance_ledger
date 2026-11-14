/**
 * CSV import: guess which column is which, let the user correct the
 * mapping, then turn rows into draft entries with a per-row reason for
 * anything that cannot be imported. Nothing is saved here.
 */
import { clampedDay, daysInMonth, type Day } from '../domain/dates';
import { parseAmount, type Minor } from '../domain/money';
import { PAYMENT_METHODS, type PaymentMethod, type TransactionType } from '../domain/types';

export const IMPORT_FIELDS = [
  'date',
  'amount',
  'debit',
  'credit',
  'type',
  'account',
  'toAccount',
  'category',
  'payee',
  'note',
  'method',
  'tags',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Field -> column index (or null when the file has no such column). */
export type ColumnMapping = Record<ImportField, number | null>;

const HEADER_HINTS: Record<ImportField, RegExp> = {
  date: /^(date|txn date|transaction date|value date|posting date|day|तारीख|दिनांक)$/,
  amount: /^(amount|signed amount|amt|value|inr|transaction amount|रकम|राशि)$/,
  debit: /^(debit|withdrawal|withdrawals|dr|debit amount|withdrawal amt|paid out|money out)$/,
  credit: /^(credit|deposit|deposits|cr|credit amount|deposit amt|paid in|money in)$/,
  type: /^(type|transaction type|txn type|dr\/cr|cr\/dr)$/,
  account: /^(account|account name|from account|from|खाता)$/,
  toAccount: /^(to account|to|destination|transfer to)$/,
  category: /^(category|categories|group|श्रेणी)$/,
  payee:
    /^(payee|merchant|description|narration|particulars|details|transaction details|remarks|name)$/,
  note: /^(note|notes|memo|comment|comments|नोट)$/,
  method: /^(method|payment method|mode|payment mode|paid by)$/,
  tags: /^(tags|tag|labels)$/,
};

export function emptyMapping(): ColumnMapping {
  return Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;
}

/** Guesses the mapping from header names. Each column is used at most once. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const mapping = emptyMapping();
  const taken = new Set<number>();
  const clean = headers.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.:*]+$/, ''),
  );
  for (const field of IMPORT_FIELDS) {
    const index = clean.findIndex((h, i) => !taken.has(i) && HEADER_HINTS[field].test(h));
    if (index >= 0) {
      mapping[field] = index;
      taken.add(index);
    }
  }
  // "Signed amount" is better than "Amount" when both exist (our own export).
  const signed = clean.indexOf('signed amount');
  if (signed >= 0) mapping.amount = signed;
  return mapping;
}

export type DateOrder = 'dmy' | 'mdy' | 'ymd';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Reads a date cell. `order` settles ambiguous all-number dates (default day first). */
export function parseDateCell(text: string, order: DateOrder = 'dmy'): Day | null {
  const s = text.trim().toLowerCase();
  if (s === '') return null;
  let year: number;
  let month: number;
  let day: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})[-/. ]([a-z]{3,9})[-/. ,]+(\d{2,4})/.exec(s))) {
    [day, month, year] = [Number(m[1]), MONTHS.indexOf((m[2] ?? '').slice(0, 3)) + 1, Number(m[3])];
  } else if ((m = /^([a-z]{3,9})[-/. ]+(\d{1,2})[-/. ,]+(\d{2,4})/.exec(s))) {
    [month, day, year] = [MONTHS.indexOf((m[1] ?? '').slice(0, 3)) + 1, Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    year = Number(m[3]);
    [day, month] = order === 'mdy' ? [b, a] : [a, b];
  } else {
    return null;
  }
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return clampedDay(year, month, day);
}

/** Works out whether all-number dates in a column are day-first or month-first. */
export function detectDateOrder(cells: readonly string[]): DateOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const cell of cells) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(cell.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst += 1;
    else if (Number(m[2]) > 12) monthFirst += 1;
  }
  return monthFirst > dayFirst ? 'mdy' : 'dmy';
}

/** Reads an amount cell: "1,234.50", "(500.00)", "500 Dr", "₹ 99", "-45". Returns a signed value. */
export function parseAmountCell(text: string, decimals = 2): Minor | null {
  let s = text.trim();
  if (s === '') return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  const suffix = /\b(dr|cr|debit|credit)\.?$/i.exec(s);
  if (suffix) {
    if (/^d/i.test(suffix[1] ?? '')) sign = -1;
    s = s.slice(0, suffix.index).trim();
  }
  const value = parseAmount(s, decimals);
  if (value === null) return null;
  return value < 0 ? value : sign * value;
}

const TYPE_WORDS: [RegExp, TransactionType][] = [
  [/^(expense|debit|dr|withdrawal|spent|purchase|payment|खर्च)$/, 'expense'],
  [/^(income|credit|cr|deposit|salary|received|आमदनी)$/, 'income'],
  [/^(transfer|self transfer|contra)$/, 'transfer'],
  [/^(card_payment|card payment|bill payment|cc payment)$/, 'card_payment'],
  [/^(refund|cashback|reversal)$/, 'refund'],
  [/^(adjustment)$/, 'adjustment'],
];

export function parseTypeCell(text: string): TransactionType | null {
  const s = text.trim().toLowerCase();
  for (const [pattern, type] of TYPE_WORDS) if (pattern.test(s)) return type;
  return null;
}

export interface ImportContext {
  /** Lower-cased account name -> id. */
  accountsByName: ReadonlyMap<string, string>;
  /** Lower-cased category name -> { id, kind }. */
  categoriesByName: ReadonlyMap<string, { id: string; kind: 'expense' | 'income' }>;
  /** Used when a row has no account column, or its name is not recognised. */
  defaultAccountId: string | null;
  decimals: number;
  dateOrder: DateOrder;
  today: Day;
}

export interface DraftRow {
  /** 1-based line in the file (excluding the header). */
  line: number;
  type: TransactionType;
  amount: Minor;
  day: Day;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  payee: string | null;
  note: string | null;
  method: PaymentMethod | null;
  tags: string[];
  /** A category name in the file that matched nothing. */
  unknownCategory: string | null;
}

export type RowProblem = 'no_date' | 'no_amount' | 'zero_amount' | 'no_account' | 'no_destination';

export interface ImportResult {
  drafts: DraftRow[];
  skipped: { line: number; problem: RowProblem }[];
  /** Category names that were not recognised (rows are still imported, uncategorised). */
  unknownCategories: string[];
}

/** Converts data rows (without the header) into draft entries. */
export function mapRows(
  rows: readonly string[][],
  mapping: ColumnMapping,
  ctx: ImportContext,
): ImportResult {
  const cell = (row: string[], field: ImportField): string => {
    const index = mapping[field];
    return index === null ? '' : (row[index] ?? '').trim();
  };
  const result: ImportResult = { drafts: [], skipped: [], unknownCategories: [] };
  const unknown = new Set<string>();

  rows.forEach((row, i) => {
    const line = i + 1;
    const day = parseDateCell(cell(row, 'date'), ctx.dateOrder);
    if (!day) return void result.skipped.push({ line, problem: 'no_date' });

    // Either one signed amount column, or separate debit and credit columns.
    let signed: Minor | null = null;
    const debit = parseAmountCell(cell(row, 'debit'), ctx.decimals);
    const credit = parseAmountCell(cell(row, 'credit'), ctx.decimals);
    if (debit !== null && debit !== 0) signed = -Math.abs(debit);
    else if (credit !== null && credit !== 0) signed = Math.abs(credit);
    else
      signed =
        parseAmountCell(cell(row, 'amount'), ctx.decimals) ??
        (debit === 0 || credit === 0 ? 0 : null);
    if (signed === null) return void result.skipped.push({ line, problem: 'no_amount' });
    if (signed === 0) return void result.skipped.push({ line, problem: 'zero_amount' });

    const explicit = parseTypeCell(cell(row, 'type'));
    const categoryName = cell(row, 'category');
    const category = categoryName
      ? ctx.categoriesByName.get(categoryName.toLowerCase())
      : undefined;
    let type: TransactionType;
    if (explicit) type = explicit;
    else if (category) type = category.kind === 'income' ? 'income' : 'expense';
    else type = signed < 0 ? 'expense' : 'income';
    // A bank statement writes every amount as positive with a type column; a
    // ledger export uses the sign. Both end up as a positive amount plus a type.
    const amount = type === 'adjustment' ? signed : Math.abs(signed);

    const accountName = cell(row, 'account').toLowerCase();
    const accountId = (accountName && ctx.accountsByName.get(accountName)) || ctx.defaultAccountId;
    if (!accountId) return void result.skipped.push({ line, problem: 'no_account' });

    let toAccountId: string | null = null;
    if (type === 'transfer' || type === 'card_payment') {
      toAccountId = ctx.accountsByName.get(cell(row, 'toAccount').toLowerCase()) ?? null;
      if (!toAccountId || toAccountId === accountId) {
        return void result.skipped.push({ line, problem: 'no_destination' });
      }
    }

    if (categoryName && !category) unknown.add(categoryName);
    const methodText = cell(row, 'method').toLowerCase();
    const method = (PAYMENT_METHODS as readonly string[]).includes(methodText)
      ? (methodText as PaymentMethod)
      : null;
    result.drafts.push({
      line,
      type,
      amount,
      day,
      accountId,
      toAccountId,
      categoryId: toAccountId ? null : (category?.id ?? null),
      payee: cell(row, 'payee') || null,
      note: cell(row, 'note') || null,
      method,
      tags: cell(row, 'tags')
        .split(/[;|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      unknownCategory: categoryName && !category ? categoryName : null,
    });
  });
  result.unknownCategories = [...unknown].sort();
  return result;
}
