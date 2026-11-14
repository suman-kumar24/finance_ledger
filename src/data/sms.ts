import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { smsAccountMap, smsInbox, transactions } from '@/db/schema';
import type { Db } from '@/db/types';
import { addDays } from '@/domain/dates';
import { currencyInfo } from '@/domain/money';
import type { PaymentMethod, Transaction, TransactionType } from '@/domain/types';
import { newId } from '@/lib/id';
import { parseEntry } from '@/parse';
import {
  classifySms,
  DUPLICATE_WINDOW_DAYS,
  findDuplicate,
  smsHash,
  type ExistingEntry,
  type RawSms,
} from '@/sms';

import { listAccounts } from './accounts';
import { batch, emitChange } from './bus';
import { listCategories } from './categories';
import { listKeywords } from './keywords';
import { getSettings, updateSettings } from './settings';
import { createTransaction } from './transactions';

export type InboxItem = typeof smsInbox.$inferSelect;

export interface ImportStats {
  read: number;
  /** OTPs, promotions, personal messages and anything else that is not a transaction. */
  ignored: number;
  /** Already imported before (same message). */
  alreadySeen: number;
  added: number;
  /** Added, but flagged as probably matching an entry already in the ledger. */
  flaggedDuplicates: number;
}

export function getAccountMap(db: Db): Map<string, string> {
  return new Map(
    db
      .select()
      .from(smsAccountMap)
      .all()
      .map((row) => [row.last4, row.accountId]),
  );
}

function setAccountMapping(db: Db, last4: string, accountId: string): void {
  db.insert(smsAccountMap)
    .values({ last4, accountId })
    .onConflictDoUpdate({ target: smsAccountMap.last4, set: { accountId } })
    .run();
}

/**
 * Parses messages and files the bank alerts in the review inbox. Nothing is
 * added to the ledger here, and no message text is written anywhere: only
 * the parsed fields and a hash are kept.
 */
export function importSms(db: Db, messages: readonly RawSms[], now = Date.now()): ImportStats {
  const stats: ImportStats = {
    read: messages.length,
    ignored: 0,
    alreadySeen: 0,
    added: 0,
    flaggedDuplicates: 0,
  };
  if (messages.length === 0) return stats;
  const settings = getSettings(db);
  const decimals = currencyInfo(settings.currency).decimals;
  const accounts = listAccounts(db, { includeArchived: true });
  const map = getAccountMap(db);
  // An account whose own "last 4 digits" match is mapped without asking.
  for (const account of accounts) {
    if (account.last4 && !map.has(account.last4)) map.set(account.last4, account.id);
  }
  const categories = listCategories(db);
  const userKeywords = listKeywords(db);

  batch(() => {
    for (const message of messages) {
      const verdict = classifySms(message, decimals);
      if (verdict.kind === 'ignored') {
        stats.ignored += 1;
        continue;
      }
      const parsed = verdict.parsed;
      const hash = smsHash(message);
      const seenInInbox = db
        .select({ id: smsInbox.id })
        .from(smsInbox)
        .where(eq(smsInbox.hash, hash))
        .get();
      const seenInLedger = db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.smsHash, hash))
        .get();
      if (seenInInbox || seenInLedger) {
        stats.alreadySeen += 1;
        continue;
      }

      const accountId = parsed.last4 ? (map.get(parsed.last4) ?? null) : null;
      const nearby: ExistingEntry[] = db
        .select({
          id: transactions.id,
          type: transactions.type,
          amount: transactions.amount,
          day: transactions.day,
          accountId: transactions.accountId,
          toAccountId: transactions.toAccountId,
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.day, addDays(parsed.day, -DUPLICATE_WINDOW_DAYS)),
            lte(transactions.day, addDays(parsed.day, DUPLICATE_WINDOW_DAYS)),
            sql`abs(${transactions.amount}) = ${parsed.amount}`,
          ),
        )
        .all();
      let duplicate = findDuplicate(
        { direction: parsed.direction, amount: parsed.amount, day: parsed.day, accountId },
        nearby,
      );
      if (!duplicate) {
        // The bank and the UPI app may both text about one payment.
        const twin = db
          .select({ id: smsInbox.id, transactionId: smsInbox.transactionId })
          .from(smsInbox)
          .where(
            and(
              eq(smsInbox.amount, parsed.amount),
              eq(smsInbox.direction, parsed.direction),
              gte(smsInbox.day, addDays(parsed.day, -DUPLICATE_WINDOW_DAYS)),
              lte(smsInbox.day, addDays(parsed.day, DUPLICATE_WINDOW_DAYS)),
              eq(smsInbox.status, 'pending'),
            ),
          )
          .get();
        if (twin) duplicate = { id: `inbox:${twin.id}` } as ExistingEntry;
      }

      const guess = parsed.merchant
        ? parseEntry(parsed.merchant, {
            today: parsed.day,
            accounts: [],
            categories,
            userKeywords,
            decimals,
          })
        : null;
      const wantKind = parsed.direction === 'debit' ? 'expense' : 'income';
      const category = guess?.categoryId
        ? categories.find((c) => c.id === guess.categoryId)
        : undefined;

      db.insert(smsInbox)
        .values({
          id: newId(),
          hash,
          direction: parsed.direction,
          amount: parsed.amount,
          last4: parsed.last4,
          merchant: parsed.merchant,
          method: parsed.method,
          instrument:
            parsed.billPayment && parsed.instrument === 'unknown' ? 'account' : parsed.instrument,
          occurredAt: parsed.occurredAt,
          day: parsed.day,
          balance: parsed.balance,
          sender: parsed.sender,
          patternId: parsed.billPayment ? `${parsed.patternId}+bill` : parsed.patternId,
          status: 'pending',
          accountId,
          categoryId: category && category.kind === wantKind ? category.id : null,
          transactionId: null,
          possibleDuplicateOf: duplicate?.id ?? null,
          createdAt: now,
        })
        .run();
      stats.added += 1;
      if (duplicate) stats.flaggedDuplicates += 1;
    }
    const newest = messages.reduce((max, m) => Math.max(max, m.date), settings.smsLastScanAt ?? 0);
    updateSettings(db, { smsLastScanAt: newest });
    emitChange();
  });
  return stats;
}

export function listInbox(db: Db, status: InboxItem['status'] = 'pending'): InboxItem[] {
  return db
    .select()
    .from(smsInbox)
    .where(eq(smsInbox.status, status))
    .orderBy(desc(smsInbox.occurredAt))
    .all();
}

export function countInbox(db: Db): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(smsInbox)
      .where(eq(smsInbox.status, 'pending'))
      .get()?.n ?? 0
  );
}

/** Whether the alert looks like a credit card bill payment. */
export function isBillPayment(item: Pick<InboxItem, 'patternId'>): boolean {
  return item.patternId.endsWith('+bill');
}

/** The entry type suggested for an alert. The user can change it before accepting. */
export function suggestedType(item: InboxItem): TransactionType {
  if (isBillPayment(item)) return 'card_payment';
  if (item.direction === 'debit') return 'expense';
  return item.instrument === 'card' ? 'refund' : 'income';
}

/**
 * Remembers which account a "last 4 digits" belongs to, and applies it to
 * every pending alert with the same digits. The user maps each one once.
 */
export function mapLast4(db: Db, last4: string, accountId: string): void {
  batch(() => {
    setAccountMapping(db, last4, accountId);
    db.update(smsInbox)
      .set({ accountId })
      .where(and(eq(smsInbox.last4, last4), eq(smsInbox.status, 'pending')))
      .run();
    emitChange();
  });
}

export interface AcceptInput {
  type: TransactionType;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  payee?: string | null;
  method?: PaymentMethod | null;
}

/** Adds a reviewed alert to the ledger. */
export function acceptInboxItem(
  db: Db,
  id: string,
  input: AcceptInput,
  now = Date.now(),
): Transaction {
  return batch(() => {
    const item = db.select().from(smsInbox).where(eq(smsInbox.id, id)).get();
    if (!item) throw new Error('Inbox item not found');
    if (item.status !== 'pending') throw new Error('Inbox item was already handled');
    const tx = createTransaction(
      db,
      {
        type: input.type,
        amount: item.amount,
        day: item.day,
        occurredAt: item.occurredAt,
        accountId: input.accountId,
        toAccountId: input.toAccountId ?? null,
        categoryId: input.categoryId ?? null,
        payee: input.payee ?? item.merchant,
        method: input.method ?? item.method,
        source: 'sms',
        smsHash: item.hash,
      },
      now,
    );
    db.update(smsInbox)
      .set({
        status: 'accepted',
        transactionId: tx.id,
        accountId: input.accountId,
        categoryId: tx.categoryId,
      })
      .where(eq(smsInbox.id, id))
      .run();
    emitChange();
    return tx;
  });
}

export function dismissInboxItem(db: Db, id: string): void {
  db.update(smsInbox).set({ status: 'dismissed' }).where(eq(smsInbox.id, id)).run();
  emitChange();
}

/** Dismisses every pending alert that was flagged as a probable duplicate. */
export function dismissDuplicates(db: Db): number {
  const flagged = listInbox(db).filter((item) => item.possibleDuplicateOf !== null);
  if (flagged.length === 0) return 0;
  db.update(smsInbox)
    .set({ status: 'dismissed' })
    .where(and(eq(smsInbox.status, 'pending'), sql`${smsInbox.possibleDuplicateOf} IS NOT NULL`))
    .run();
  emitChange();
  return flagged.length;
}

/** Turning SMS import off also clears everything it collected. */
export function clearSmsData(db: Db): void {
  db.transaction((tx) => {
    tx.delete(smsInbox).run();
    tx.delete(smsAccountMap).run();
  });
  updateSettings(db, { smsEnabled: false, smsListenNew: false, smsLastScanAt: null });
}
