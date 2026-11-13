/**
 * Local notifications. Nothing here talks to a server: no push token is
 * requested and every notification is scheduled on the device.
 */
import * as Notifications from 'expo-notifications';

import { listCardStatements, listAccounts } from '@/data/accounts';
import { takeBudgetAlerts } from '@/data/alerts';
import { currentPeriodKey } from '@/data/queries';
import { listRecurringRules } from '@/data/recurring';
import { getSettings, type Language } from '@/data/settings';
import { listEntriesForAccount } from '@/data/transactions';
import type { Db } from '@/db/types';
import type { BudgetAlert } from '@/domain/budgets';
import { cardStatus } from '@/domain/cards';
import { dayFromDate, dayFromTimestamp, type Day } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { planNotifications, plannedDate, type PlannedNotification } from '@/domain/notifications';
import { translate, type StringKey } from '@/i18n';

const CHANNEL = 'ledger-alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureChannel(language: Language): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: translate(language, 'notify.channel'),
    // eslint-disable-next-line import/namespace -- re-exported through 'export *', which the lint resolver misses
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function notificationsAllowed(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

/** Asks for the notification permission (Android 13+). Returns whether it was granted. */
export async function requestNotifications(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

interface Message {
  title: string;
  body: string;
}

export function messageFor(
  n: PlannedNotification,
  language: Language,
  money: (amount: number) => string,
): Message {
  const t = (key: StringKey, params?: Record<string, string | number>) =>
    translate(language, key, params);
  const amount = n.amount === null ? '' : money(n.amount);
  switch (n.kind) {
    case 'bill_soon':
      return {
        title: t('notify.billSoonTitle', { name: n.name }),
        body: t('notify.billBody', { amount }),
      };
    case 'bill_today':
      return {
        title: t('notify.billTodayTitle', { name: n.name }),
        body: t('notify.billBody', { amount }),
      };
    case 'recurring':
      return {
        title: t('notify.recurringTitle', { name: n.name }),
        body: t(n.auto ? 'notify.recurringAutoBody' : 'notify.recurringBody', { amount }),
      };
    case 'daily_reminder':
      return { title: t('notify.dailyTitle'), body: t('notify.dailyBody') };
    case 'export_reminder':
      return { title: t('notify.exportTitle'), body: t('notify.exportBody') };
  }
}

export function budgetMessage(
  alert: BudgetAlert,
  language: Language,
  money: (amount: number) => string,
): Message {
  const t = (key: StringKey, params?: Record<string, string | number>) =>
    translate(language, key, params);
  const { status } = alert;
  const params = {
    name: status.name,
    percent: status.percent,
    spent: money(status.spent),
    limit: money(status.limit),
    over: money(Math.max(0, -status.remaining)),
  };
  if (alert.level === 'warning') {
    return { title: t('notify.budgetWarnTitle', params), body: t('notify.budgetWarnBody', params) };
  }
  return {
    title: t(
      alert.level === 'over' ? 'notify.budgetOverTitle' : 'notify.budgetFurtherTitle',
      params,
    ),
    body: t('notify.budgetOverBody', params),
  };
}

function buildPlan(db: Db, today: Day, now: Date): PlannedNotification[] {
  const settings = getSettings(db);
  const statements = listCardStatements(db);
  const cards = listAccounts(db)
    .filter((a) => a.type === 'credit_card')
    .map((account) => ({
      account,
      status: cardStatus(account, listEntriesForAccount(db, account.id), today, statements),
    }));
  const last = settings.lastExportAt ?? settings.installedAt;
  return planNotifications({
    today,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
    notifyBills: settings.notifyBills,
    notifyRecurring: settings.notifyRecurring,
    dailyReminder: settings.dailyReminder,
    dailyReminderTime: settings.dailyReminderTime,
    exportReminder: settings.exportReminder,
    backupEnabled: settings.backupEnabled,
    lastExportDay: last === null ? null : dayFromTimestamp(last),
    cards,
    rules: listRecurringRules(db),
  });
}

let syncing: Promise<void> | null = null;
let again = false;

async function syncOnce(db: Db): Promise<void> {
  if (!(await notificationsAllowed())) return;
  const settings = getSettings(db);
  const now = new Date();
  const plan = buildPlan(db, dayFromDate(now), now);
  const money = (amount: number) =>
    formatMoney(amount, { currency: settings.currency, grouping: settings.grouping });
  await ensureChannel(settings.language);
  // Rebuild from scratch: a paid bill or deleted rule simply stops being planned.
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const item of plan) {
    const content = { ...messageFor(item, settings.language, money), data: { kind: item.kind } };
    const date = plannedDate(item);
    if (item.repeatsDaily || date === null) {
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: item.hour,
          minute: item.minute,
          channelId: CHANNEL,
        },
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(date.year, date.month - 1, date.day, item.hour, item.minute, 0, 0),
          channelId: CHANNEL,
        },
      });
    }
  }
}

/** Reschedules every time-based notification to match the current data. */
export function syncNotifications(db: Db): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = syncOnce(db)
    .catch(() => undefined)
    .finally(() => {
      syncing = null;
      if (again) {
        again = false;
        void syncNotifications(db);
      }
    });
  return syncing;
}

/** Fires budget alerts that an entry has just triggered. Each fires once per month. */
export async function fireBudgetAlerts(db: Db, day: Day): Promise<BudgetAlert[]> {
  const settings = getSettings(db);
  const today = dayFromDate(new Date());
  // Alerts concern the current period only; backdated entries stay quiet.
  const period = currentPeriodKey(settings, today);
  if (currentPeriodKey(settings, day) !== period) return [];
  const alerts = takeBudgetAlerts(db, period, today);
  if (alerts.length === 0 || !settings.notifyBudgets || !(await notificationsAllowed()))
    return alerts;
  const money = (amount: number) =>
    formatMoney(amount, {
      currency: settings.currency,
      grouping: settings.grouping,
      fraction: 'never',
    });
  await ensureChannel(settings.language);
  for (const alert of alerts) {
    await Notifications.scheduleNotificationAsync({
      identifier: alert.key,
      content: { ...budgetMessage(alert, settings.language, money), data: { kind: 'budget' } },
      trigger: { channelId: CHANNEL },
    });
  }
  return alerts;
}
