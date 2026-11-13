/**
 * What counts as spending, income and saving in a period (brief §3).
 *
 *  - `expense` adds to spending in its category, whatever account paid:
 *    a card purchase is spending in the month it happened.
 *  - `card_payment` and `transfer` are never spending or income.
 *  - `refund` (refunds and cashback) reduces spending in its expense category
 *    in the month it is credited. A category's month never drops below zero.
 *    A refund with no category, or with an income category, is reported as
 *    income instead, because there is no spending category to reduce.
 *  - `adjustment` counts only when the user gives it a category: in an
 *    expense category a negative adjustment adds spending (a positive one
 *    reduces it); in an income category it adds to income.
 *  - A transfer into a savings or investment account is "Saved/Invested";
 *    a transfer back out reduces it. Transfers between two saving accounts
 *    or two ordinary accounts change nothing.
 */
import type { Day } from './dates';
import type { Minor } from './money';
import { isSavingType, type Account, type Category, type LedgerEntry } from './types';

export const UNCATEGORIZED = '__uncategorized__';

export interface CategoryTotals {
  categoryId: string;
  /** Sum of expenses (and spending adjustments) before refunds. */
  gross: Minor;
  /** Refunds, cashback and positive adjustments credited in the period. */
  credits: Minor;
  /** max(0, gross - credits): the category's spending for the period. */
  net: Minor;
  count: number;
}

export interface PeriodSummary {
  /** Total spending: the sum of every category's net. */
  spending: Minor;
  income: Minor;
  /** Net amount moved into savings and investments (can be negative). */
  saved: Minor;
  /** income - spending - saved */
  leftover: Minor;
  /** Bill payments made in the period (informational; never spending). */
  cardPayments: Minor;
  /** Spending by the category the entry was filed under. */
  byCategory: Map<string, CategoryTotals>;
  /** Income by category id (UNCATEGORIZED when none). */
  incomeByCategory: Map<string, Minor>;
  /** Number of entries that counted towards the summary. */
  count: number;
}

export interface SummaryContext {
  accounts: ReadonlyMap<string, Pick<Account, 'type'>>;
  categories: ReadonlyMap<string, Pick<Category, 'kind' | 'parentId'>>;
}

export interface DayRange {
  start: Day;
  end: Day;
}

function bucket(map: Map<string, CategoryTotals>, categoryId: string): CategoryTotals {
  let totals = map.get(categoryId);
  if (!totals) {
    totals = { categoryId, gross: 0, credits: 0, net: 0, count: 0 };
    map.set(categoryId, totals);
  }
  return totals;
}

function addIncome(map: Map<string, Minor>, categoryId: string | null, amount: Minor): void {
  const key = categoryId ?? UNCATEGORIZED;
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** Summarises cleared entries, optionally limited to a day range. */
export function summarize(
  entries: readonly LedgerEntry[],
  context: SummaryContext,
  range?: DayRange,
): PeriodSummary {
  const byCategory = new Map<string, CategoryTotals>();
  const incomeByCategory = new Map<string, Minor>();
  let saved = 0;
  let cardPayments = 0;
  let count = 0;

  const kindOf = (categoryId: string | null) =>
    categoryId === null ? null : (context.categories.get(categoryId)?.kind ?? null);
  const savingAccount = (accountId: string | null) => {
    if (accountId === null) return false;
    const account = context.accounts.get(accountId);
    return account !== undefined && isSavingType(account.type);
  };

  for (const entry of entries) {
    if (entry.status !== 'cleared') continue;
    if (range && (entry.day < range.start || entry.day > range.end)) continue;
    count += 1;
    const kind = kindOf(entry.categoryId);
    switch (entry.type) {
      case 'expense': {
        // An expense filed under an income category is still spending.
        const totals = bucket(byCategory, entry.categoryId ?? UNCATEGORIZED);
        totals.gross += entry.amount;
        totals.count += 1;
        break;
      }
      case 'income':
        addIncome(incomeByCategory, entry.categoryId, entry.amount);
        break;
      case 'refund':
        if (kind === 'expense' && entry.categoryId !== null) {
          const totals = bucket(byCategory, entry.categoryId);
          totals.credits += entry.amount;
          totals.count += 1;
        } else {
          addIncome(incomeByCategory, entry.categoryId, entry.amount);
        }
        break;
      case 'adjustment':
        if (entry.categoryId === null || kind === null) {
          count -= 1; // not part of spending or income
        } else if (kind === 'expense') {
          const totals = bucket(byCategory, entry.categoryId);
          if (entry.amount < 0) totals.gross += -entry.amount;
          else totals.credits += entry.amount;
          totals.count += 1;
        } else {
          addIncome(incomeByCategory, entry.categoryId, entry.amount);
        }
        break;
      case 'transfer': {
        const fromSaving = savingAccount(entry.accountId);
        const toSaving = savingAccount(entry.toAccountId);
        if (toSaving && !fromSaving) saved += entry.amount;
        else if (fromSaving && !toSaving) saved -= entry.amount;
        break;
      }
      case 'card_payment':
        cardPayments += entry.amount;
        break;
    }
  }

  let spending = 0;
  for (const totals of byCategory.values()) {
    totals.net = Math.max(0, totals.gross - totals.credits);
    spending += totals.net;
  }
  let income = 0;
  for (const [key, value] of incomeByCategory) {
    const floored = Math.max(0, value);
    incomeByCategory.set(key, floored);
    income += floored;
  }
  return {
    spending,
    income,
    saved,
    leftover: income - spending - saved,
    cardPayments,
    byCategory,
    incomeByCategory,
    count,
  };
}

/**
 * Spending per TOP-LEVEL category: each subcategory's net is added to its
 * parent. Sorted largest first.
 */
export function spendingByTopCategory(
  summary: PeriodSummary,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): { categoryId: string; amount: Minor }[] {
  const totals = new Map<string, Minor>();
  for (const row of summary.byCategory.values()) {
    const parent = categories.get(row.categoryId)?.parentId ?? null;
    const key = parent ?? row.categoryId;
    totals.set(key, (totals.get(key) ?? 0) + row.net);
  }
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.categoryId.localeCompare(b.categoryId));
}

/**
 * Spending for a set of categories. Choosing a parent category also covers
 * its subcategories; nothing is counted twice.
 */
export function spendingForCategories(
  summary: PeriodSummary,
  categoryIds: readonly string[],
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): Minor {
  const wanted = new Set(categoryIds);
  let total = 0;
  for (const row of summary.byCategory.values()) {
    const parent = categories.get(row.categoryId)?.parentId ?? null;
    if (wanted.has(row.categoryId) || (parent !== null && wanted.has(parent))) {
      total += row.net;
    }
  }
  return total;
}
