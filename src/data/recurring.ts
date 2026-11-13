import { asc, eq } from 'drizzle-orm';

import { recurringRules } from '@/db/schema';
import type { Db } from '@/db/types';
import { parseDay, type Day } from '@/domain/dates';
import { occurrenceAfter, resolveDue } from '@/domain/recurring';
import type { RecurringRule, Transaction } from '@/domain/types';
import { newId } from '@/lib/id';

import { batch, emitChange } from './bus';
import { createTransaction } from './transactions';

type Row = typeof recurringRules.$inferSelect;

function toRule(row: Row): RecurringRule {
  const { createdAt: _c, updatedAt: _u, ...rule } = row;
  return rule;
}

export type RecurringInput = Omit<RecurringRule, 'id' | 'anchorDay' | 'active'> & {
  active?: boolean;
};

export function listRecurringRules(db: Db): RecurringRule[] {
  return db.select().from(recurringRules).orderBy(asc(recurringRules.nextDate)).all().map(toRule);
}

export function getRecurringRule(db: Db, id: string): RecurringRule | null {
  const row = db.select().from(recurringRules).where(eq(recurringRules.id, id)).get();
  return row ? toRule(row) : null;
}

function monthBased(frequency: RecurringRule['frequency']): boolean {
  return frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly';
}

function clean(input: RecurringInput) {
  const moves = input.type === 'transfer' || input.type === 'card_payment';
  return {
    name: input.name.trim(),
    type: input.type,
    amount: input.amount,
    accountId: input.accountId,
    toAccountId: moves ? input.toAccountId : null,
    categoryId: moves ? null : input.categoryId,
    method: moves ? null : input.method,
    frequency: input.frequency,
    interval: Math.max(1, Math.floor(input.interval)),
    // Remember the day of month so a rule on the 31st returns to the 31st.
    anchorDay: monthBased(input.frequency) ? parseDay(input.nextDate).day : null,
    nextDate: input.nextDate,
    endDate: input.endDate,
    mode: input.mode,
    active: input.active ?? true,
    note: input.note?.trim() || null,
  };
}

export function createRecurringRule(
  db: Db,
  input: RecurringInput,
  now = Date.now(),
): RecurringRule {
  const row: Row = { id: newId(), ...clean(input), createdAt: now, updatedAt: now };
  db.insert(recurringRules).values(row).run();
  emitChange();
  return toRule(row);
}

export function updateRecurringRule(
  db: Db,
  id: string,
  input: RecurringInput,
  now = Date.now(),
): void {
  db.update(recurringRules)
    .set({ ...clean(input), updatedAt: now })
    .where(eq(recurringRules.id, id))
    .run();
  emitChange();
}

export function setRecurringActive(db: Db, id: string, active: boolean, now = Date.now()): void {
  db.update(recurringRules).set({ active, updatedAt: now }).where(eq(recurringRules.id, id)).run();
  emitChange();
}

export function deleteRecurringRule(db: Db, id: string): void {
  db.delete(recurringRules).where(eq(recurringRules.id, id)).run();
  emitChange();
}

function materialize(db: Db, rule: RecurringRule, day: Day, today: Day, now: number): Transaction {
  return createTransaction(
    db,
    {
      type: rule.type,
      amount: rule.amount,
      day,
      accountId: rule.accountId,
      toAccountId: rule.toAccountId,
      categoryId: rule.categoryId,
      method: rule.method,
      payee: rule.name,
      note: rule.note,
      source: 'recurring',
      recurringRuleId: rule.id,
      status: day > today ? 'scheduled' : 'cleared',
    },
    now,
  );
}

/**
 * Creates the entries for "auto-create" rules whose date has arrived and
 * moves those rules forward. "Remind only" rules are left alone: they stay
 * due until the user records or skips them.
 */
export function processRecurring(db: Db, today: Day, now = Date.now()): Transaction[] {
  return batch(() => {
    const created: Transaction[] = [];
    for (const rule of listRecurringRules(db)) {
      if (!rule.active || rule.mode !== 'auto') continue;
      const result = resolveDue(rule, today);
      if (result.due.length === 0) continue;
      let failed = false;
      for (const day of result.due) {
        try {
          created.push(materialize(db, rule, day, today, now));
        } catch {
          // An account was removed or the rule is invalid: pause it instead of failing start-up.
          failed = true;
          break;
        }
      }
      db.update(recurringRules)
        .set(
          failed
            ? { active: false, updatedAt: now }
            : { nextDate: result.nextDate, active: result.stillActive, updatedAt: now },
        )
        .where(eq(recurringRules.id, rule.id))
        .run();
    }
    if (created.length > 0) emitChange();
    return created;
  });
}

function advance(db: Db, rule: RecurringRule, now: number): void {
  const nextDate = occurrenceAfter(rule, rule.nextDate);
  const stillActive = rule.endDate === null || nextDate <= rule.endDate;
  db.update(recurringRules)
    .set({ nextDate, active: stillActive, updatedAt: now })
    .where(eq(recurringRules.id, rule.id))
    .run();
}

/** Records the rule's next occurrence as a transaction and moves the rule on. */
export function recordOccurrence(
  db: Db,
  ruleId: string,
  today: Day,
  now = Date.now(),
): Transaction | null {
  const rule = getRecurringRule(db, ruleId);
  if (!rule) return null;
  return batch(() => {
    // Recorded early: book it today rather than as a future plan.
    const day = rule.nextDate > today ? today : rule.nextDate;
    const tx = materialize(db, rule, day, today, now);
    advance(db, rule, now);
    emitChange();
    return tx;
  });
}

/** Skips the rule's next occurrence without recording anything. */
export function skipOccurrence(db: Db, ruleId: string, now = Date.now()): void {
  const rule = getRecurringRule(db, ruleId);
  if (!rule) return;
  advance(db, rule, now);
  emitChange();
}
