/**
 * Read models for screens: each function gathers rows and runs the pure
 * domain functions over them.
 */
import type { Db } from '@/db/types';
import { netWorth, type NetWorth } from '@/domain/balances';
import {
  budgetStatus,
  budgetTotals,
  pace,
  type BudgetStatus,
  type BudgetTotals,
  type Pace,
} from '@/domain/budgets';
import { cardStatus, type CardStatus } from '@/domain/cards';
import type { Day } from '@/domain/dates';
import type { Minor } from '@/domain/money';
import {
  periodForDay,
  periodFromKey,
  periodProgress,
  recentPeriodKeys,
  shiftPeriodKey,
  type Period,
  type PeriodProgress,
} from '@/domain/months';
import {
  categoryBreakdown,
  categoryChanges,
  monthlyTrend,
  type BreakdownRow,
  type ChangeRow,
  type TrendPoint,
} from '@/domain/reports';
import { spendingByTopCategory, summarize, type PeriodSummary } from '@/domain/spending';
import type { Account, Category } from '@/domain/types';

import { getBalances, listAccounts, listCardStatements } from './accounts';
import { listBudgets } from './budgets';
import { listCategories } from './categories';
import type { Settings } from './settings';
import { listEntries, listEntriesForAccount } from './transactions';

export interface Lookups {
  accounts: Account[];
  categories: Category[];
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
}

export function loadLookups(db: Db): Lookups {
  const accounts = listAccounts(db, { includeArchived: true });
  const categories = listCategories(db, { includeArchived: true });
  return {
    accounts,
    categories,
    accountById: new Map(accounts.map((a) => [a.id, a])),
    categoryById: new Map(categories.map((c) => [c.id, c])),
  };
}

export interface PeriodView {
  period: Period;
  progress: PeriodProgress;
  summary: PeriodSummary;
  budgets: BudgetStatus[];
  totals: BudgetTotals;
  /** Pace of total spending against the total budget; null when no budget is set. */
  pace: Pace | null;
  topCategories: { categoryId: string; amount: Minor }[];
  lookups: Lookups;
}

export function currentPeriodKey(settings: Pick<Settings, 'monthStartDay'>, today: Day): string {
  return periodForDay(today, settings.monthStartDay).key;
}

/** Everything the Overview shows for one period. */
export function loadPeriodView(
  db: Db,
  periodKey: string,
  settings: Pick<Settings, 'monthStartDay' | 'budgetWarningPercent'>,
  today: Day,
): PeriodView {
  const period = periodFromKey(periodKey, settings.monthStartDay);
  const lookups = loadLookups(db);
  const entries = listEntries(db, period.start, period.end);
  const summary = summarize(entries, {
    accounts: lookups.accountById,
    categories: lookups.categoryById,
  });
  const budgets = listBudgets(db, period.key).map((b) =>
    budgetStatus(b, summary, lookups.categoryById, settings.budgetWarningPercent),
  );
  const totals = budgetTotals(budgets);
  const progress = periodProgress(period, today);
  return {
    period,
    progress,
    summary,
    budgets,
    totals,
    pace: totals.limit > 0 ? pace(summary.spending, totals.limit, progress) : null,
    topCategories: spendingByTopCategory(summary, lookups.categoryById).slice(0, 5),
    lookups,
  };
}

export interface AccountsView {
  accounts: Account[];
  balances: Map<string, Minor>;
  totals: NetWorth;
  cards: Map<string, CardStatus>;
}

/** Balances, net worth and card positions for the Accounts tab. */
export function loadAccountsView(db: Db, today: Day, includeArchived = false): AccountsView {
  const all = listAccounts(db, { includeArchived: true });
  const balances = getBalances(db);
  const statements = listCardStatements(db);
  const cards = new Map<string, CardStatus>();
  for (const account of all) {
    if (account.type !== 'credit_card' || (account.archived && !includeArchived)) continue;
    cards.set(
      account.id,
      cardStatus(account, listEntriesForAccount(db, account.id), today, statements),
    );
  }
  return {
    accounts: all.filter((a) => includeArchived || !a.archived),
    balances,
    totals: netWorth(all, balances),
    cards,
  };
}

export interface ReportsView {
  trend: TrendPoint[];
  selected: Period;
  summary: PeriodSummary;
  breakdown: BreakdownRow[];
  changes: ChangeRow[];
  previousKey: string;
  lookups: Lookups;
}

/** Trend for the last `months` periods plus a breakdown of the selected one. */
export function loadReports(
  db: Db,
  settings: Pick<Settings, 'monthStartDay'>,
  today: Day,
  months: number,
  selectedKey: string,
): ReportsView {
  const lookups = loadLookups(db);
  const context = { accounts: lookups.accountById, categories: lookups.categoryById };
  const currentKey = currentPeriodKey(settings, today);
  const keys = recentPeriodKeys(currentKey, months);
  const previousKey = shiftPeriodKey(selectedKey, -1);
  const selected = periodFromKey(selectedKey, settings.monthStartDay);
  const previous = periodFromKey(previousKey, settings.monthStartDay);
  const firstKey = [keys[0] ?? currentKey, previousKey].sort()[0] ?? previousKey;
  const lastKey = [currentKey, selectedKey].sort()[1] ?? currentKey;
  const entries = listEntries(
    db,
    periodFromKey(firstKey, settings.monthStartDay).start,
    periodFromKey(lastKey, settings.monthStartDay).end,
  );
  const summary = summarize(entries, context, { start: selected.start, end: selected.end });
  const before = summarize(entries, context, { start: previous.start, end: previous.end });
  return {
    trend: monthlyTrend(entries, context, keys, settings.monthStartDay),
    selected,
    summary,
    breakdown: categoryBreakdown(summary, lookups.categoryById),
    changes: categoryChanges(summary, before, lookups.categoryById),
    previousKey,
    lookups,
  };
}
