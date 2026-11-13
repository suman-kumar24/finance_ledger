import { and, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';

import { accounts, categories, transactions } from '@/db/schema';
import type { Db } from '@/db/types';
import { dayFromTimestamp, timestampFromDay, type Day } from '@/domain/dates';
import type { Minor } from '@/domain/money';
import type {
  LedgerEntry,
  PaymentMethod,
  Transaction,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '@/domain/types';
import { normalizeType, validateTransaction, type TxProblem } from '@/domain/validate';
import { newId } from '@/lib/id';

import { emitChange } from './bus';

type Row = typeof transactions.$inferSelect;

function toTransaction(row: Row): Transaction {
  return { ...row, tags: Array.isArray(row.tags) ? row.tags : [] };
}

export interface TransactionInput {
  type: TransactionType;
  amount: Minor;
  day: Day;
  /** Defaults to now when the day is today, otherwise noon on that day. */
  occurredAt?: number;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  payee?: string | null;
  method?: PaymentMethod | null;
  note?: string | null;
  tags?: string[];
  status?: TransactionStatus;
  source?: TransactionSource;
  smsHash?: string | null;
  recurringRuleId?: string | null;
}

export class InvalidTransactionError extends Error {
  constructor(public readonly problems: TxProblem[]) {
    super(`Invalid transaction: ${problems.join(', ')}`);
    this.name = 'InvalidTransactionError';
  }
}

function accountTypes(db: Db) {
  return new Map(
    db
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .all()
      .map((a) => [a.id, { type: a.type }]),
  );
}

function clean(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function buildRow(
  db: Db,
  input: TransactionInput,
  id: string,
  now: number,
  createdAt: number,
): Row {
  const types = accountTypes(db);
  const draft = {
    type: input.type,
    amount: input.amount,
    day: input.day,
    accountId: input.accountId,
    toAccountId: input.toAccountId ?? null,
  };
  const type = normalizeType(draft, types);
  const hasDestination = type === 'transfer' || type === 'card_payment';
  const normalized = { ...draft, type, toAccountId: hasDestination ? draft.toAccountId : null };
  const problems = validateTransaction(normalized, types);
  if (problems.length > 0) throw new InvalidTransactionError(problems);
  const occurredAt =
    input.occurredAt ??
    (dayFromTimestamp(now) === input.day ? now : timestampFromDay(input.day, 12, 0));
  return {
    id,
    type,
    amount: input.amount,
    occurredAt,
    day: input.day,
    accountId: input.accountId,
    toAccountId: normalized.toAccountId,
    // Money moving between your own accounts has no spending category.
    categoryId: hasDestination ? null : (input.categoryId ?? null),
    payee: clean(input.payee),
    method: input.method ?? null,
    note: clean(input.note),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    status: input.status ?? 'cleared',
    source: input.source ?? 'manual',
    smsHash: input.smsHash ?? null,
    recurringRuleId: input.recurringRuleId ?? null,
    createdAt,
    updatedAt: now,
  };
}

export function createTransaction(db: Db, input: TransactionInput, now = Date.now()): Transaction {
  const row = buildRow(db, input, newId(), now, now);
  db.insert(transactions).values(row).run();
  emitChange();
  return toTransaction(row);
}

/** Inserts many rows in one database transaction (imports, seeding). */
export function createTransactions(db: Db, inputs: TransactionInput[], now = Date.now()): number {
  const rows = inputs.map((input) => buildRow(db, input, newId(), now, now));
  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i += 200) {
      tx.insert(transactions)
        .values(rows.slice(i, i + 200))
        .run();
    }
  });
  emitChange();
  return rows.length;
}

export function getTransaction(db: Db, id: string): Transaction | null {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  return row ? toTransaction(row) : null;
}

export function updateTransaction(
  db: Db,
  id: string,
  input: TransactionInput,
  now = Date.now(),
): Transaction {
  const current = getTransaction(db, id);
  if (!current) throw new Error('Transaction not found');
  const row = buildRow(
    db,
    {
      ...input,
      source: input.source ?? current.source,
      smsHash: input.smsHash ?? current.smsHash,
      recurringRuleId: input.recurringRuleId ?? current.recurringRuleId,
      occurredAt: input.occurredAt ?? (input.day === current.day ? current.occurredAt : undefined),
    },
    id,
    now,
    current.createdAt,
  );
  db.update(transactions).set(row).where(eq(transactions.id, id)).run();
  emitChange();
  return toTransaction(row);
}

/** Deletes a transaction and returns it so the caller can offer "Undo". */
export function deleteTransaction(db: Db, id: string): Transaction | null {
  const current = getTransaction(db, id);
  if (!current) return null;
  db.delete(transactions).where(eq(transactions.id, id)).run();
  emitChange();
  return current;
}

/** Puts back a transaction removed by deleteTransaction. */
export function restoreTransaction(db: Db, tx: Transaction): void {
  db.insert(transactions).values(tx).onConflictDoNothing().run();
  emitChange();
}

export interface TransactionFilter {
  search?: string;
  types?: TransactionType[];
  accountIds?: string[];
  categoryIds?: string[];
  methods?: PaymentMethod[];
  sources?: TransactionSource[];
  /** Inclusive bounds on the absolute amount, in minor units. */
  minAmount?: Minor | null;
  maxAmount?: Minor | null;
  start?: Day | null;
  end?: Day | null;
  status?: TransactionStatus;
}

export function isFilterActive(filter: TransactionFilter): boolean {
  return Boolean(
    filter.search?.trim() ||
    filter.types?.length ||
    filter.accountIds?.length ||
    filter.categoryIds?.length ||
    filter.methods?.length ||
    filter.sources?.length ||
    filter.minAmount != null ||
    filter.maxAmount != null ||
    filter.start ||
    filter.end ||
    filter.status,
  );
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function filterConditions(db: Db, filter: TransactionFilter): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (filter.types?.length) parts.push(inArray(transactions.type, filter.types));
  if (filter.accountIds?.length) {
    parts.push(
      or(
        inArray(transactions.accountId, filter.accountIds),
        inArray(transactions.toAccountId, filter.accountIds),
      ),
    );
  }
  if (filter.categoryIds?.length) {
    // Choosing a parent category includes its subcategories.
    const children = db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.parentId, filter.categoryIds))
      .all()
      .map((c) => c.id);
    parts.push(inArray(transactions.categoryId, [...filter.categoryIds, ...children]));
  }
  if (filter.methods?.length) parts.push(inArray(transactions.method, filter.methods));
  if (filter.sources?.length) parts.push(inArray(transactions.source, filter.sources));
  if (filter.minAmount != null) parts.push(sql`abs(${transactions.amount}) >= ${filter.minAmount}`);
  if (filter.maxAmount != null) parts.push(sql`abs(${transactions.amount}) <= ${filter.maxAmount}`);
  if (filter.start) parts.push(gte(transactions.day, filter.start));
  if (filter.end) parts.push(lte(transactions.day, filter.end));
  if (filter.status) parts.push(eq(transactions.status, filter.status));
  const search = filter.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    const categoryIds = db
      .select({ id: categories.id })
      .from(categories)
      .where(sql`${categories.name} LIKE ${pattern} ESCAPE '\\'`)
      .all()
      .map((c) => c.id);
    const textMatch: (SQL | undefined)[] = [
      sql`${transactions.payee} LIKE ${pattern} ESCAPE '\\'`,
      sql`${transactions.note} LIKE ${pattern} ESCAPE '\\'`,
      sql`${transactions.tags} LIKE ${pattern} ESCAPE '\\'`,
    ];
    if (categoryIds.length) textMatch.push(inArray(transactions.categoryId, categoryIds));
    const digits = search.replace(/[,\s]/g, '');
    if (/^\d+(\.\d{1,2})?$/.test(digits)) {
      textMatch.push(
        like(sql`CAST(${transactions.amount} AS TEXT)`, `${digits.replace('.', '')}%`),
      );
    }
    parts.push(or(...textMatch));
  }
  const present = parts.filter((p): p is SQL => p !== undefined);
  return present.length ? and(...present) : undefined;
}

/** One page of the transaction list, newest first. */
export function listTransactions(
  db: Db,
  filter: TransactionFilter = {},
  page: { limit: number; offset: number } = { limit: 50, offset: 0 },
): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(filterConditions(db, filter))
    .orderBy(desc(transactions.day), desc(transactions.occurredAt), desc(transactions.id))
    .limit(page.limit)
    .offset(page.offset)
    .all()
    .map(toTransaction);
}

export function countTransactions(db: Db, filter: TransactionFilter = {}): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(filterConditions(db, filter))
      .get()?.n ?? 0
  );
}

/** Every transaction matching a filter (exports). */
export function listAllTransactions(db: Db, filter: TransactionFilter = {}): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(filterConditions(db, filter))
    .orderBy(desc(transactions.day), desc(transactions.occurredAt), desc(transactions.id))
    .all()
    .map(toTransaction);
}

const ENTRY_COLUMNS = {
  type: transactions.type,
  amount: transactions.amount,
  day: transactions.day,
  accountId: transactions.accountId,
  toAccountId: transactions.toAccountId,
  categoryId: transactions.categoryId,
  status: transactions.status,
};

/** Light rows for the accounting functions, limited to a day range. */
export function listEntries(db: Db, start: Day, end: Day): LedgerEntry[] {
  return db
    .select(ENTRY_COLUMNS)
    .from(transactions)
    .where(and(gte(transactions.day, start), lte(transactions.day, end)))
    .all();
}

/** Light rows for everything that touches one account. */
export function listEntriesForAccount(db: Db, accountId: string): LedgerEntry[] {
  return db
    .select(ENTRY_COLUMNS)
    .from(transactions)
    .where(or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)))
    .all();
}

/** Category ids ordered by how often they were used recently. */
export function mostUsedCategoryIds(
  db: Db,
  sinceDay: Day,
  type: TransactionType = 'expense',
): string[] {
  return db
    .select({ id: transactions.categoryId, n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.type, type), gte(transactions.day, sinceDay)))
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`count(*)`))
    .all()
    .map((r) => r.id)
    .filter((id): id is string => id !== null);
}

/** The account used most recently for a kind of entry, for the quick-add default. */
export function lastUsedAccountId(db: Db, type: TransactionType = 'expense'): string | null {
  return (
    db
      .select({ id: transactions.accountId })
      .from(transactions)
      .where(eq(transactions.type, type))
      .orderBy(desc(transactions.createdAt))
      .limit(1)
      .get()?.id ?? null
  );
}

/** Scheduled entries, soonest first, optionally up to a day. */
export function listScheduled(db: Db, upTo?: Day): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.status, 'scheduled'), upTo ? lte(transactions.day, upTo) : undefined),
    )
    .orderBy(transactions.day)
    .all()
    .map(toTransaction);
}

/** Marks scheduled entries whose day has arrived as cleared. Returns how many changed. */
export function clearDueScheduled(db: Db, today: Day, now = Date.now()): number {
  const due = listScheduled(db, today);
  if (due.length === 0) return 0;
  db.update(transactions)
    .set({ status: 'cleared', updatedAt: now })
    .where(and(eq(transactions.status, 'scheduled'), lte(transactions.day, today)))
    .run();
  emitChange();
  return due.length;
}

/** Total expenses per day for the days shown in the list (for day headers). */
export function dayExpenseTotals(db: Db, filter: TransactionFilter, fromDay: Day): Map<Day, Minor> {
  const rows = db
    .select({ day: transactions.day, total: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(
      and(
        filterConditions(db, filter),
        eq(transactions.type, 'expense'),
        eq(transactions.status, 'cleared'),
        gte(transactions.day, fromDay),
      ),
    )
    .groupBy(transactions.day)
    .all();
  return new Map(rows.map((r) => [r.day, r.total]));
}
