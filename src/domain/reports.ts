/**
 * Report maths: monthly trend, category breakdown and month-over-month change.
 */
import type { Minor } from './money';
import { periodFromKey } from './months';
import {
  spendingByTopCategory,
  summarize,
  type PeriodSummary,
  type SummaryContext,
} from './spending';
import type { Category, LedgerEntry } from './types';

export interface TrendPoint {
  key: string;
  spending: Minor;
  income: Minor;
  saved: Minor;
}

/** Spending, income and saved for each period, in the order given. */
export function monthlyTrend(
  entries: readonly LedgerEntry[],
  context: SummaryContext,
  periodKeys: readonly string[],
  monthStartDay: number,
): TrendPoint[] {
  return periodKeys.map((key) => {
    const period = periodFromKey(key, monthStartDay);
    const s = summarize(entries, context, { start: period.start, end: period.end });
    return { key, spending: s.spending, income: s.income, saved: s.saved };
  });
}

export interface BreakdownRow {
  categoryId: string;
  amount: Minor;
  /** Share of total spending, 0-1. */
  share: number;
}

export function categoryBreakdown(
  summary: PeriodSummary,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): BreakdownRow[] {
  const total = summary.spending;
  return spendingByTopCategory(summary, categories).map((row) => ({
    ...row,
    share: total > 0 ? row.amount / total : 0,
  }));
}

export interface ChangeRow {
  categoryId: string;
  current: Minor;
  previous: Minor;
  /** current - previous */
  change: Minor;
  /** Whole percent change; null when there was nothing last month. */
  percent: number | null;
}

/** Per-category change against the previous period, biggest movers first. */
export function categoryChanges(
  current: PeriodSummary,
  previous: PeriodSummary,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): ChangeRow[] {
  const now = new Map(
    spendingByTopCategory(current, categories).map((r) => [r.categoryId, r.amount]),
  );
  const before = new Map(
    spendingByTopCategory(previous, categories).map((r) => [r.categoryId, r.amount]),
  );
  const ids = new Set([...now.keys(), ...before.keys()]);
  return [...ids]
    .map((categoryId) => {
      const c = now.get(categoryId) ?? 0;
      const p = before.get(categoryId) ?? 0;
      return {
        categoryId,
        current: c,
        previous: p,
        change: c - p,
        percent: p > 0 ? Math.round(((c - p) * 100) / p) : null,
      };
    })
    .sort(
      (a, b) => Math.abs(b.change) - Math.abs(a.change) || a.categoryId.localeCompare(b.categoryId),
    );
}

/** A "nice" upper bound for a chart axis (1, 2, 2.5 or 5 times a power of ten). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * power) return step * power;
  }
  return 10 * power;
}
