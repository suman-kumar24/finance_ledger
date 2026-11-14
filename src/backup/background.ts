/**
 * Daily automatic backup while the app is closed (best effort: Android
 * decides when background work actually runs). The same check also runs
 * every time the app is opened, so a missed run is caught up.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { initDatabase } from '@/db/client';

import { runAutoBackup } from './service';

export const AUTO_BACKUP_TASK = 'ledger-auto-backup';

TaskManager.defineTask(AUTO_BACKUP_TASK, async () => {
  try {
    const db = await initDatabase();
    await runAutoBackup(db);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function setAutoBackupScheduled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await BackgroundTask.registerTaskAsync(AUTO_BACKUP_TASK, { minimumInterval: 12 * 60 });
    } else {
      await BackgroundTask.unregisterTaskAsync(AUTO_BACKUP_TASK);
    }
  } catch {
    // Background work is unavailable (battery saver, restricted): opening the app still backs up.
  }
}
