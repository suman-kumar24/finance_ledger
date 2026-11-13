import { asc, desc, eq } from 'drizzle-orm';

import { goalContributions, goals, plannedPurchases } from '@/db/schema';
import type { Db } from '@/db/types';
import type { Day } from '@/domain/dates';
import type { Minor } from '@/domain/money';
import type {
  Goal,
  GoalContribution,
  PlannedPurchase,
  Priority,
  PurchaseStatus,
  Transaction,
} from '@/domain/types';
import { newId } from '@/lib/id';

import { batch, emitChange } from './bus';
import { createTransaction, type TransactionInput } from './transactions';

export interface GoalInput {
  name: string;
  targetAmount: Minor;
  targetDate: Day | null;
  accountId: string | null;
  color: string;
  icon: string;
}

export function listGoals(db: Db, options: { includeArchived?: boolean } = {}): Goal[] {
  return db
    .select()
    .from(goals)
    .orderBy(asc(goals.createdAt))
    .all()
    .filter((g) => options.includeArchived || !g.archived)
    .map(({ updatedAt: _u, ...goal }) => goal);
}

export function getGoal(db: Db, id: string): Goal | null {
  const row = db.select().from(goals).where(eq(goals.id, id)).get();
  if (!row) return null;
  const { updatedAt: _u, ...goal } = row;
  return goal;
}

export function createGoal(db: Db, input: GoalInput, now = Date.now()): Goal {
  const row = {
    id: newId(),
    ...input,
    name: input.name.trim(),
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(goals).values(row).run();
  emitChange();
  const { updatedAt: _u, ...goal } = row;
  return goal;
}

export function updateGoal(
  db: Db,
  id: string,
  patch: Partial<GoalInput & { archived: boolean }>,
  now = Date.now(),
): void {
  db.update(goals)
    .set({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}), updatedAt: now })
    .where(eq(goals.id, id))
    .run();
  emitChange();
}

/** Deletes a goal and its contribution records. Transfers already made stay in the ledger. */
export function deleteGoal(db: Db, id: string): void {
  db.delete(goals).where(eq(goals.id, id)).run();
  emitChange();
}

export function listContributions(db: Db, goalId?: string): GoalContribution[] {
  const query = db.select().from(goalContributions);
  const rows = goalId
    ? query.where(eq(goalContributions.goalId, goalId)).orderBy(desc(goalContributions.day)).all()
    : query.orderBy(desc(goalContributions.day)).all();
  return rows.map(({ createdAt: _c, ...c }) => c);
}

/**
 * Adds money to (or, with a negative amount, takes it out of) a goal.
 * With `fromAccountId` and a goal linked to a savings account, it also
 * records the transfer between the two accounts, so balances stay right.
 */
export function addContribution(
  db: Db,
  input: {
    goalId: string;
    amount: Minor;
    day: Day;
    note?: string | null;
    fromAccountId?: string | null;
  },
  today: Day,
  now = Date.now(),
): GoalContribution {
  return batch(() => {
    const goal = getGoal(db, input.goalId);
    if (!goal) throw new Error('Goal not found');
    if (!Number.isSafeInteger(input.amount) || input.amount === 0)
      throw new Error('Invalid amount');
    let transaction: Transaction | null = null;
    const other = input.fromAccountId ?? null;
    if (goal.accountId !== null && other !== null && other !== goal.accountId) {
      const adding = input.amount > 0;
      transaction = createTransaction(
        db,
        {
          type: 'transfer',
          amount: Math.abs(input.amount),
          day: input.day,
          accountId: adding ? other : goal.accountId,
          toAccountId: adding ? goal.accountId : other,
          payee: goal.name,
          note: input.note ?? null,
          status: input.day > today ? 'scheduled' : 'cleared',
        },
        now,
      );
    }
    const row = {
      id: newId(),
      goalId: input.goalId,
      amount: input.amount,
      day: input.day,
      note: input.note?.trim() || null,
      transactionId: transaction?.id ?? null,
      createdAt: now,
    };
    db.insert(goalContributions).values(row).run();
    emitChange();
    const { createdAt: _c, ...contribution } = row;
    return contribution;
  });
}

export function deleteContribution(db: Db, id: string): void {
  db.delete(goalContributions).where(eq(goalContributions.id, id)).run();
  emitChange();
}

export interface PurchaseInput {
  name: string;
  estimatedPrice: Minor;
  priority: Priority;
  fundingNotes: string | null;
  status?: PurchaseStatus;
}

function toPurchase(row: typeof plannedPurchases.$inferSelect): PlannedPurchase {
  const { updatedAt: _u, ...purchase } = row;
  return purchase;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function listPurchases(db: Db): PlannedPurchase[] {
  return db
    .select()
    .from(plannedPurchases)
    .all()
    .map(toPurchase)
    .sort(
      (a, b) =>
        Number(a.status === 'bought') - Number(b.status === 'bought') ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt - b.createdAt,
    );
}

export function getPurchase(db: Db, id: string): PlannedPurchase | null {
  const row = db.select().from(plannedPurchases).where(eq(plannedPurchases.id, id)).get();
  return row ? toPurchase(row) : null;
}

export function createPurchase(db: Db, input: PurchaseInput, now = Date.now()): PlannedPurchase {
  const row = {
    id: newId(),
    name: input.name.trim(),
    estimatedPrice: input.estimatedPrice,
    priority: input.priority,
    fundingNotes: input.fundingNotes?.trim() || null,
    status: input.status ?? ('thinking' as PurchaseStatus),
    transactionId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(plannedPurchases).values(row).run();
  emitChange();
  return toPurchase(row);
}

export function updatePurchase(
  db: Db,
  id: string,
  patch: Partial<PurchaseInput>,
  now = Date.now(),
): void {
  db.update(plannedPurchases)
    .set({
      ...patch,
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.fundingNotes !== undefined
        ? { fundingNotes: patch.fundingNotes?.trim() || null }
        : {}),
      updatedAt: now,
    })
    .where(eq(plannedPurchases.id, id))
    .run();
  emitChange();
}

export function deletePurchase(db: Db, id: string): void {
  db.delete(plannedPurchases).where(eq(plannedPurchases.id, id)).run();
  emitChange();
}

/** Buying a planned purchase turns it into an expense and marks it bought. */
export function buyPurchase(
  db: Db,
  id: string,
  payment: Pick<TransactionInput, 'amount' | 'day' | 'accountId' | 'categoryId' | 'method'>,
  now = Date.now(),
): Transaction {
  return batch(() => {
    const purchase = getPurchase(db, id);
    if (!purchase) throw new Error('Planned purchase not found');
    if (purchase.status === 'bought') throw new Error('Already bought');
    const tx = createTransaction(db, { ...payment, type: 'expense', payee: purchase.name }, now);
    db.update(plannedPurchases)
      .set({ status: 'bought', transactionId: tx.id, updatedAt: now })
      .where(eq(plannedPurchases.id, id))
      .run();
    emitChange();
    return tx;
  });
}
