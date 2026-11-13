import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';

import { budgetCategories, budgets } from '@/db/schema';
import type { Db } from '@/db/types';
import { copyBudgets } from '@/domain/budgets';
import type { Minor } from '@/domain/money';
import type { Budget } from '@/domain/types';
import { newId } from '@/lib/id';

import { emitChange } from './bus';

export function listBudgets(db: Db, period: string): Budget[] {
  const rows = db
    .select()
    .from(budgets)
    .where(eq(budgets.period, period))
    .orderBy(asc(budgets.sortOrder), asc(budgets.createdAt))
    .all();
  if (rows.length === 0) return [];
  const links = db
    .select()
    .from(budgetCategories)
    .where(
      inArray(
        budgetCategories.budgetId,
        rows.map((r) => r.id),
      ),
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    seriesId: row.seriesId,
    name: row.name,
    period: row.period,
    limit: row.limit,
    recurring: row.recurring,
    sortOrder: row.sortOrder,
    categoryIds: links.filter((l) => l.budgetId === row.id).map((l) => l.categoryId),
  }));
}

export interface BudgetInput {
  name: string;
  period: string;
  limit: Minor;
  recurring: boolean;
  categoryIds: string[];
}

function insertBudget(db: Db, budget: Budget, now: number): void {
  db.insert(budgets)
    .values({
      id: budget.id,
      seriesId: budget.seriesId,
      name: budget.name,
      period: budget.period,
      limit: budget.limit,
      recurring: budget.recurring,
      sortOrder: budget.sortOrder,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const unique = [...new Set(budget.categoryIds)];
  if (unique.length > 0) {
    db.insert(budgetCategories)
      .values(unique.map((categoryId) => ({ budgetId: budget.id, categoryId })))
      .run();
  }
}

export function createBudget(db: Db, input: BudgetInput, now = Date.now()): Budget {
  const id = newId();
  const budget: Budget = {
    id,
    seriesId: id,
    name: input.name.trim(),
    period: input.period,
    limit: input.limit,
    recurring: input.recurring,
    categoryIds: input.categoryIds,
    sortOrder: listBudgets(db, input.period).length,
  };
  db.transaction((tx) => insertBudget(tx as unknown as Db, budget, now));
  emitChange();
  return budget;
}

export function updateBudget(
  db: Db,
  id: string,
  patch: Partial<Omit<BudgetInput, 'period'>>,
  now = Date.now(),
): void {
  db.transaction((tx) => {
    const set: Partial<typeof budgets.$inferInsert> = { updatedAt: now };
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.limit !== undefined) set.limit = patch.limit;
    if (patch.recurring !== undefined) set.recurring = patch.recurring;
    tx.update(budgets).set(set).where(eq(budgets.id, id)).run();
    if (patch.categoryIds) {
      tx.delete(budgetCategories).where(eq(budgetCategories.budgetId, id)).run();
      const unique = [...new Set(patch.categoryIds)];
      if (unique.length > 0) {
        tx.insert(budgetCategories)
          .values(unique.map((categoryId) => ({ budgetId: id, categoryId })))
          .run();
      }
    }
  });
  emitChange();
}

/**
 * Deletes a budget from its month. Earlier months keep theirs, but the series
 * stops recurring so it is not carried forward again.
 */
export function deleteBudget(db: Db, id: string, now = Date.now()): void {
  const row = db.select().from(budgets).where(eq(budgets.id, id)).get();
  if (!row) return;
  db.transaction((tx) => {
    tx.update(budgets)
      .set({ recurring: false, updatedAt: now })
      .where(eq(budgets.seriesId, row.seriesId))
      .run();
    tx.delete(budgets).where(eq(budgets.id, id)).run();
  });
  emitChange();
}

/** The most recent period before `period` that has any budgets. */
export function previousBudgetPeriod(db: Db, period: string): string | null {
  return (
    db
      .select({ period: budgets.period })
      .from(budgets)
      .where(lt(budgets.period, period))
      .orderBy(desc(budgets.period))
      .limit(1)
      .get()?.period ?? null
  );
}

function copyInto(db: Db, period: string, recurringOnly: boolean, now: number): number {
  const from = previousBudgetPeriod(db, period);
  if (from === null) return 0;
  const copies = copyBudgets(listBudgets(db, from), period, listBudgets(db, period), newId, {
    recurringOnly,
  });
  if (copies.length === 0) return 0;
  db.transaction((tx) => {
    for (const copy of copies) insertBudget(tx as unknown as Db, copy, now);
  });
  emitChange();
  return copies.length;
}

/** "Copy last month's budgets": copies every budget from the latest earlier month. */
export function copyLastBudgets(db: Db, period: string, now = Date.now()): number {
  return copyInto(db, period, false, now);
}

/** Carries recurring budgets into a period that does not have them yet. */
export function ensureRecurringBudgets(db: Db, period: string, now = Date.now()): number {
  const hasAny = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.period, period)))
    .limit(1)
    .get();
  if (hasAny) return 0;
  return copyInto(db, period, true, now);
}
