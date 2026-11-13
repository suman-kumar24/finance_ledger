/**
 * Plans the local notifications that should be scheduled (brief §8).
 * Pure: it returns what to schedule; `src/notify` talks to the OS.
 *
 * Because there is no server, everything time-based is scheduled ahead:
 *  - card bill due in 3 days, and on the due day, while the bill is unpaid;
 *  - each recurring rule's next occurrence;
 *  - the optional end-of-day reminder (a daily repeating notification);
 *  - the monthly "export your data" reminder when Drive backup is off.
 * The plan is rebuilt whenever data changes, so paying a bill removes its
 * reminders. Budget alerts are not planned here: they fire at the moment an
 * entry pushes a budget over a threshold (see budgets.ts).
 */
import type { CardStatus } from './cards';
import { addDays, parseDay, type Day } from './dates';
import type { Minor } from './money';
import type { Account, RecurringRule } from './types';

export type PlannedKind =
  'bill_soon' | 'bill_today' | 'recurring' | 'daily_reminder' | 'export_reminder';

export interface PlannedNotification {
  /** Stable identifier, so re-planning replaces rather than duplicates. */
  id: string;
  kind: PlannedKind;
  /** When to deliver it (local wall-clock time). */
  day: Day | null;
  hour: number;
  minute: number;
  /** True for the daily repeating reminder. */
  repeatsDaily: boolean;
  /** Values for the message template. */
  name: string;
  amount: Minor | null;
  auto?: boolean;
}

export interface PlanInput {
  today: Day;
  /** Minutes since midnight now, so notifications already past today are skipped. */
  nowMinutes: number;
  notifyBills: boolean;
  notifyRecurring: boolean;
  dailyReminder: boolean;
  dailyReminderTime: string;
  exportReminder: boolean;
  backupEnabled: boolean;
  /** Day of the last export or backup, or the install day if never. */
  lastExportDay: Day | null;
  cards: { account: Pick<Account, 'id' | 'name'>; status: CardStatus }[];
  rules: RecurringRule[];
}

export const BILL_REMINDER_DAYS_BEFORE = 3;
export const ALERT_HOUR = 9;
export const EXPORT_REMINDER_EVERY_DAYS = 30;

export function parseTime(text: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  const hour = m ? Number(m[1]) : 21;
  const minute = m ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return { hour: 21, minute: 0 };
  return { hour, minute };
}

function inFuture(day: Day, hour: number, minute: number, input: PlanInput): boolean {
  if (day > input.today) return true;
  return day === input.today && hour * 60 + minute > input.nowMinutes;
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const plan: PlannedNotification[] = [];
  const at = { hour: ALERT_HOUR, minute: 0, repeatsDaily: false };

  if (input.notifyBills) {
    for (const { account, status } of input.cards) {
      if (status.currentBill <= 0 || status.dueDate === null) continue;
      const soon = addDays(status.dueDate, -BILL_REMINDER_DAYS_BEFORE);
      const base = { name: account.name, amount: status.currentBill, ...at };
      if (inFuture(soon, at.hour, at.minute, input)) {
        plan.push({
          id: `bill-soon-${account.id}-${status.dueDate}`,
          kind: 'bill_soon',
          day: soon,
          ...base,
        });
      }
      if (inFuture(status.dueDate, at.hour, at.minute, input)) {
        plan.push({
          id: `bill-today-${account.id}-${status.dueDate}`,
          kind: 'bill_today',
          day: status.dueDate,
          ...base,
        });
      }
    }
  }

  if (input.notifyRecurring) {
    for (const rule of input.rules) {
      if (!rule.active) continue;
      if (rule.endDate !== null && rule.nextDate > rule.endDate) continue;
      if (!inFuture(rule.nextDate, at.hour, at.minute, input)) continue;
      plan.push({
        id: `rule-${rule.id}-${rule.nextDate}`,
        kind: 'recurring',
        day: rule.nextDate,
        name: rule.name,
        amount: rule.amount,
        auto: rule.mode === 'auto',
        ...at,
      });
    }
  }

  if (input.dailyReminder) {
    const { hour, minute } = parseTime(input.dailyReminderTime);
    plan.push({
      id: 'daily-reminder',
      kind: 'daily_reminder',
      day: null,
      hour,
      minute,
      repeatsDaily: true,
      name: '',
      amount: null,
    });
  }

  if (input.exportReminder && !input.backupEnabled) {
    const from = input.lastExportDay ?? input.today;
    let day = addDays(from, EXPORT_REMINDER_EVERY_DAYS);
    if (!inFuture(day, at.hour, at.minute, input)) {
      // Already overdue: remind tomorrow morning rather than immediately on open.
      day = addDays(input.today, 1);
    }
    plan.push({ id: `export-${day}`, kind: 'export_reminder', day, name: '', amount: null, ...at });
  }

  return plan.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || a.id.localeCompare(b.id));
}

/** Local timestamp parts for a planned one-off notification. */
export function plannedDate(
  n: PlannedNotification,
): { year: number; month: number; day: number } | null {
  return n.day === null ? null : parseDay(n.day);
}
