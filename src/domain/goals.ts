/**
 * Savings goals: progress and the monthly amount needed to hit the date.
 */
import { parseDay, type Day } from './dates';
import { percentFloor, ratio, type Minor } from './money';
import type { Goal, GoalContribution } from './types';

export type GoalState = 'reached' | 'active' | 'past_due' | 'open_ended';

export interface GoalProgress {
  saved: Minor;
  /** Never negative. */
  remaining: Minor;
  /** 0-1 for drawing. */
  fraction: number;
  percent: number;
  state: GoalState;
  /** Months left including the current one; null without a target date. */
  monthsLeft: number | null;
  /** Amount to set aside each remaining month; null without a date, 0 when reached. */
  monthlyNeeded: Minor | null;
}

/**
 * Months from `today` to `target`, counting the current month, so a goal due
 * later this month has 1 month left and one due on the same day next month
 * has 1 as well (one more pay cycle).
 */
export function monthsUntil(today: Day, target: Day): number {
  if (target <= today) return 0;
  const a = parseDay(today);
  const b = parseDay(target);
  const months = (b.year - a.year) * 12 + (b.month - a.month) + (b.day > a.day ? 1 : 0);
  return Math.max(1, months);
}

export function goalProgress(
  goal: Pick<Goal, 'targetAmount' | 'targetDate'>,
  contributions: readonly Pick<GoalContribution, 'amount'>[],
  today: Day,
): GoalProgress {
  let saved = 0;
  for (const c of contributions) saved += c.amount;
  const remaining = Math.max(0, goal.targetAmount - saved);
  const reached = goal.targetAmount > 0 && saved >= goal.targetAmount;
  let state: GoalState;
  let monthsLeft: number | null = null;
  let monthlyNeeded: Minor | null = null;
  if (reached) {
    state = 'reached';
    monthlyNeeded = 0;
    monthsLeft = goal.targetDate ? monthsUntil(today, goal.targetDate) : null;
  } else if (goal.targetDate === null) {
    state = 'open_ended';
  } else {
    monthsLeft = monthsUntil(today, goal.targetDate);
    if (monthsLeft === 0) {
      state = 'past_due';
      monthlyNeeded = remaining;
    } else {
      state = 'active';
      // Round up so the plan never falls a paisa short.
      monthlyNeeded = Math.ceil(remaining / monthsLeft);
    }
  }
  return {
    saved,
    remaining,
    fraction: Math.max(0, Math.min(1, ratio(saved, goal.targetAmount))),
    percent: Math.max(0, percentFloor(saved, goal.targetAmount)),
    state,
    monthsLeft,
    monthlyNeeded,
  };
}
