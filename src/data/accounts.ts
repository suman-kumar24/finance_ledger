import { asc, eq, or, sql } from 'drizzle-orm';

import { accounts, cardStatements, recurringRules, transactions } from '@/db/schema';
import type { Db } from '@/db/types';
import { balancesFromSums, type MovementSum } from '@/domain/balances';
import type { Day } from '@/domain/dates';
import { ACCOUNT_ICONS, PALETTE } from '@/domain/defaults';
import type { Minor } from '@/domain/money';
import type { Account, AccountType, CardStatement, TransactionType } from '@/domain/types';
import { newId } from '@/lib/id';

import { emitChange } from './bus';

type Row = typeof accounts.$inferSelect;

function toAccount(row: Row): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    openingBalance: row.openingBalance,
    openingDate: row.openingDate,
    currency: row.currency,
    color: row.color,
    icon: row.icon,
    archived: row.archived,
    creditLimit: row.creditLimit,
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    last4: row.last4,
    sortOrder: row.sortOrder,
  };
}

export interface AccountInput {
  name: string;
  type: AccountType;
  /** Signed asset value (negative for a card's outstanding). */
  openingBalance: Minor;
  openingDate: Day;
  currency: string;
  color?: string;
  icon?: string;
  creditLimit?: Minor | null;
  statementDay?: number | null;
  dueDay?: number | null;
  last4?: string | null;
}

export function listAccounts(db: Db, options: { includeArchived?: boolean } = {}): Account[] {
  const rows = db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt))
    .all();
  return rows.map(toAccount).filter((a) => options.includeArchived || !a.archived);
}

export function getAccount(db: Db, id: string): Account | null {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  return row ? toAccount(row) : null;
}

function cleanDay(value: number | null | undefined): number | null {
  if (value == null || !Number.isInteger(value) || value < 1 || value > 31) return null;
  return value;
}

function cleanLast4(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '').slice(-4);
  return digits.length === 4 ? digits : null;
}

export function createAccount(db: Db, input: AccountInput, now = Date.now()): Account {
  const count =
    db
      .select({ n: sql<number>`count(*)` })
      .from(accounts)
      .get()?.n ?? 0;
  const isCard = input.type === 'credit_card';
  const row: Row = {
    id: newId(),
    name: input.name.trim(),
    type: input.type,
    openingBalance: input.openingBalance,
    openingDate: input.openingDate,
    currency: input.currency,
    color: input.color ?? PALETTE[count % PALETTE.length] ?? '#0F7B6C',
    icon: input.icon ?? ACCOUNT_ICONS[input.type],
    archived: false,
    creditLimit: isCard ? (input.creditLimit ?? null) : null,
    statementDay: isCard ? cleanDay(input.statementDay) : null,
    dueDay: isCard ? cleanDay(input.dueDay) : null,
    last4: cleanLast4(input.last4),
    sortOrder: count,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(accounts).values(row).run();
  emitChange();
  return toAccount(row);
}

export function updateAccount(
  db: Db,
  id: string,
  patch: Partial<AccountInput>,
  now = Date.now(),
): void {
  const current = getAccount(db, id);
  if (!current) throw new Error('Account not found');
  const type = patch.type ?? current.type;
  const isCard = type === 'credit_card';
  db.update(accounts)
    .set({
      name: patch.name?.trim() ?? current.name,
      type,
      openingBalance: patch.openingBalance ?? current.openingBalance,
      openingDate: patch.openingDate ?? current.openingDate,
      currency: patch.currency ?? current.currency,
      color: patch.color ?? current.color,
      icon: patch.icon ?? current.icon,
      creditLimit: isCard
        ? patch.creditLimit !== undefined
          ? patch.creditLimit
          : current.creditLimit
        : null,
      statementDay: isCard
        ? patch.statementDay !== undefined
          ? cleanDay(patch.statementDay)
          : current.statementDay
        : null,
      dueDay: isCard
        ? patch.dueDay !== undefined
          ? cleanDay(patch.dueDay)
          : current.dueDay
        : null,
      last4: patch.last4 !== undefined ? cleanLast4(patch.last4) : current.last4,
      updatedAt: now,
    })
    .where(eq(accounts.id, id))
    .run();
  emitChange();
}

export function setAccountArchived(db: Db, id: string, archived: boolean, now = Date.now()): void {
  db.update(accounts).set({ archived, updatedAt: now }).where(eq(accounts.id, id)).run();
  emitChange();
}

/** Number of transactions and recurring rules that reference an account. */
export function accountUsage(db: Db, id: string): { transactions: number; rules: number } {
  const tx =
    db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)))
      .get()?.n ?? 0;
  const rules =
    db
      .select({ n: sql<number>`count(*)` })
      .from(recurringRules)
      .where(or(eq(recurringRules.accountId, id), eq(recurringRules.toAccountId, id)))
      .get()?.n ?? 0;
  return { transactions: tx, rules };
}

export class AccountInUseError extends Error {
  constructor(public readonly usage: { transactions: number; rules: number }) {
    super('Account has transactions; archive it instead');
    this.name = 'AccountInUseError';
  }
}

/**
 * Deletes an account only when nothing refers to it. An account with
 * history cannot be deleted (that would corrupt past months): the caller
 * should offer to archive it instead.
 */
export function deleteAccount(db: Db, id: string): void {
  const usage = accountUsage(db, id);
  if (usage.transactions > 0 || usage.rules > 0) throw new AccountInUseError(usage);
  db.delete(accounts).where(eq(accounts.id, id)).run();
  emitChange();
}

interface SumRow {
  accountId: string;
  type: TransactionType;
  total: number;
}

/** Balances of every account, computed with two indexed GROUP BY queries. */
export function getBalances(db: Db, asOf?: Day): Map<string, Minor> {
  const upTo = asOf ? sql`AND t.day <= ${asOf}` : sql``;
  const primary = db.all<SumRow>(sql`
    SELECT t.account_id AS accountId, t.type AS type, SUM(t.amount) AS total
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.status = 'cleared' AND t.day >= a.opening_date ${upTo}
    GROUP BY t.account_id, t.type`);
  const destination = db.all<SumRow>(sql`
    SELECT t.to_account_id AS accountId, t.type AS type, SUM(t.amount) AS total
    FROM transactions t JOIN accounts a ON a.id = t.to_account_id
    WHERE t.status = 'cleared' AND t.day >= a.opening_date ${upTo}
    GROUP BY t.to_account_id, t.type`);
  const sums: MovementSum[] = [
    ...primary.map((r) => ({ ...r, side: 'primary' as const })),
    ...destination.map((r) => ({ ...r, side: 'destination' as const })),
  ];
  return balancesFromSums(listAccounts(db, { includeArchived: true }), sums);
}

export function listCardStatements(db: Db, accountId?: string): CardStatement[] {
  const rows = accountId
    ? db.select().from(cardStatements).where(eq(cardStatements.accountId, accountId)).all()
    : db.select().from(cardStatements).all();
  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    statementDate: r.statementDate,
    minimumDue: r.minimumDue,
    statedTotal: r.statedTotal,
  }));
}

/** Saves the figures printed on a statement (minimum due and, optionally, the total). */
export function saveCardStatement(
  db: Db,
  input: {
    accountId: string;
    statementDate: Day;
    minimumDue: Minor | null;
    statedTotal: Minor | null;
  },
  now = Date.now(),
): void {
  db.insert(cardStatements)
    .values({ id: newId(), ...input, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [cardStatements.accountId, cardStatements.statementDate],
      set: { minimumDue: input.minimumDue, statedTotal: input.statedTotal, updatedAt: now },
    })
    .run();
  emitChange();
}
