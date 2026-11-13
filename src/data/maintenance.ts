import type { Db } from '@/db/types';
import type { Day } from '@/domain/dates';

import { batch } from './bus';
import { ensureRecurringBudgets } from './budgets';
import { currentPeriodKey } from './queries';
import { processRecurring } from './recurring';
import { getSettings, updateSettings } from './settings';
import { clearDueScheduled } from './transactions';

/**
 * Housekeeping that runs when the app opens or returns to the foreground:
 * scheduled entries whose day has come are cleared, auto-create recurring
 * rules add their entries, and recurring budgets are carried into a new month.
 */
export function runMaintenance(db: Db, today: Day, now = Date.now()): void {
  batch(() => {
    const settings = getSettings(db);
    if (settings.installedAt === null) updateSettings(db, { installedAt: now });
    clearDueScheduled(db, today, now);
    processRecurring(db, today, now);
    ensureRecurringBudgets(db, currentPeriodKey(settings, today), now);
  });
}
