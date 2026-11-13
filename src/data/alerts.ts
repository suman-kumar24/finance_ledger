import { like } from 'drizzle-orm';

import { alertLog } from '@/db/schema';
import type { Db } from '@/db/types';
import { alertKeysToRecord, dueBudgetAlerts, type BudgetAlert } from '@/domain/budgets';
import type { Day } from '@/domain/dates';

import { loadPeriodView } from './queries';
import { getSettings } from './settings';

export function firedAlertKeys(db: Db, prefix: string): Set<string> {
  return new Set(
    db
      .select({ key: alertLog.key })
      .from(alertLog)
      .where(like(alertLog.key, `${prefix}%`))
      .all()
      .map((r) => r.key),
  );
}

export function recordAlerts(db: Db, keys: string[], now = Date.now()): void {
  if (keys.length === 0) return;
  db.insert(alertLog)
    .values(keys.map((key) => ({ key, firedAt: now })))
    .onConflictDoNothing()
    .run();
}

/**
 * Budget alerts that are due for a period and have not fired yet. They are
 * marked as fired here, so each one is returned exactly once.
 */
export function takeBudgetAlerts(
  db: Db,
  periodKey: string,
  today: Day,
  now = Date.now(),
): BudgetAlert[] {
  const settings = getSettings(db);
  const view = loadPeriodView(db, periodKey, settings, today);
  const fired = firedAlertKeys(db, 'budget:');
  const alerts = dueBudgetAlerts(view.budgets, periodKey, fired, settings.budgetWarningPercent);
  recordAlerts(
    db,
    alerts.flatMap((alert) => alertKeysToRecord(alert, periodKey)),
    now,
  );
  return alerts;
}
