/**
 * Budget groups (brief §4 and §8).
 *
 * A budget is a named limit over one or more categories for one period.
 * Choosing a parent category covers its subcategories.
 */
import type { PeriodProgress } from './months';
import { mulDiv, percentFloor, type Minor } from './money';
import { spendingForCategories, type PeriodSummary } from './spending';
import type { Budget, Category } from './types';

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  budgetId: string;
  seriesId: string;
  name: string;
  limit: Minor;
  spent: Minor;
  /** limit - spent; negative when over budget. */
  remaining: Minor;
  /** Whole percent of the limit used (floored; can exceed 100). */
  percent: number;
  state: BudgetState;
}

export const DEFAULT_WARNING_PERCENT = 80;
/** A second "over budget" alert fires this many percent past the limit. */
export const FURTHER_OVER_PERCENT = 10;

/** State of a spent amount against a limit. Exactly at the limit is a warning, not over. */
export function budgetState(
  spent: Minor,
  limit: Minor,
  warningPercent = DEFAULT_WARNING_PERCENT,
): BudgetState {
  if (limit <= 0) return spent > 0 ? 'over' : 'ok';
  if (spent > limit) return 'over';
  // spent/limit >= warningPercent/100, in integers
  if (spent * 100 >= limit * warningPercent) return 'warning';
  return 'ok';
}

export function budgetStatus(
  budget: Budget,
  summary: PeriodSummary,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
  warningPercent = DEFAULT_WARNING_PERCENT,
): BudgetStatus {
  const spent = spendingForCategories(summary, budget.categoryIds, categories);
  return {
    budgetId: budget.id,
    seriesId: budget.seriesId,
    name: budget.name,
    limit: budget.limit,
    spent,
    remaining: budget.limit - spent,
    percent: percentFloor(spent, budget.limit),
    state: budgetState(spent, budget.limit, warningPercent),
  };
}

export type PaceState = 'under' | 'on' | 'ahead';

export interface Pace {
  state: PaceState;
  /** What an even spread of the limit would have spent by today. */
  expected: Minor;
  /** spent - expected (positive = spending faster than the limit allows). */
  difference: Minor;
  /** Limit left divided by days left (0 when none left). */
  perDayLeft: Minor;
}

/** Within this share of the limit either side of an even spread counts as "on pace". */
export const PACE_TOLERANCE_PERCENT = 5;

/** Compares spending so far with an even spread of the limit over the period. */
export function pace(spent: Minor, limit: Minor, progress: PeriodProgress): Pace {
  const expected =
    progress.totalDays > 0 ? mulDiv(limit, progress.dayNumber, progress.totalDays) : limit;
  const difference = spent - expected;
  const tolerance = mulDiv(limit, PACE_TOLERANCE_PERCENT, 100);
  let state: PaceState = 'on';
  if (difference > tolerance) state = 'ahead';
  else if (difference < -tolerance) state = 'under';
  const remaining = Math.max(0, limit - spent);
  // Today still counts as a day to spend in.
  const daysToSpread = progress.state === 'current' ? progress.daysLeft + 1 : progress.daysLeft;
  return {
    state,
    expected,
    difference,
    perDayLeft: daysToSpread > 0 ? Math.floor(remaining / daysToSpread) : 0,
  };
}

export interface BudgetTotals {
  limit: Minor;
  /** Sum of each budget's spending (categories outside every budget are excluded). */
  budgetedSpent: Minor;
}

export function budgetTotals(statuses: readonly BudgetStatus[]): BudgetTotals {
  let limit = 0;
  let budgetedSpent = 0;
  for (const s of statuses) {
    limit += s.limit;
    budgetedSpent += s.spent;
  }
  return { limit, budgetedSpent };
}

export type BudgetAlertLevel = 'warning' | 'over' | 'further_over';

export interface BudgetAlert {
  /** Stable key: one alert per level per budget series per period. */
  key: string;
  level: BudgetAlertLevel;
  status: BudgetStatus;
}

export function budgetAlertKey(seriesId: string, period: string, level: BudgetAlertLevel): string {
  return `budget:${seriesId}:${period}:${level}`;
}

/**
 * Alerts that should fire now and have not fired yet this period:
 * once at the warning threshold, once when the limit is passed, and once
 * more when spending is a further 10% over.
 */
export function dueBudgetAlerts(
  statuses: readonly BudgetStatus[],
  period: string,
  alreadyFired: ReadonlySet<string>,
  warningPercent = DEFAULT_WARNING_PERCENT,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  for (const status of statuses) {
    if (status.limit <= 0) continue;
    const reached: BudgetAlertLevel[] = [];
    if (status.spent * 100 >= status.limit * warningPercent) reached.push('warning');
    if (status.spent > status.limit) reached.push('over');
    if (status.spent * 100 >= status.limit * (100 + FURTHER_OVER_PERCENT)) {
      reached.push('further_over');
    }
    // Only the highest new level fires, so one save never sends three alerts.
    const fresh = reached.filter(
      (level) => !alreadyFired.has(budgetAlertKey(status.seriesId, period, level)),
    );
    const top = fresh[fresh.length - 1];
    if (top) alerts.push({ key: budgetAlertKey(status.seriesId, period, top), level: top, status });
  }
  return alerts;
}

/** Keys to record once an alert has fired: its own level and every lower one. */
export function alertKeysToRecord(alert: BudgetAlert, period: string): string[] {
  const order: BudgetAlertLevel[] = ['warning', 'over', 'further_over'];
  return order
    .slice(0, order.indexOf(alert.level) + 1)
    .map((level) => budgetAlertKey(alert.status.seriesId, period, level));
}

/**
 * Copies budgets into another period ("copy last month's budgets", and the
 * automatic carry-forward of recurring budgets). Series already present in
 * the target period are skipped.
 */
export function copyBudgets(
  source: readonly Budget[],
  targetPeriod: string,
  existingInTarget: readonly Budget[],
  newId: () => string,
  options: { recurringOnly?: boolean } = {},
): Budget[] {
  const present = new Set(existingInTarget.map((b) => b.seriesId));
  return source
    .filter((b) => !present.has(b.seriesId) && (!options.recurringOnly || b.recurring))
    .map((b) => ({
      ...b,
      id: newId(),
      period: targetPeriod,
      categoryIds: [...b.categoryIds],
    }));
}
