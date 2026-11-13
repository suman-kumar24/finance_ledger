import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { updateSettings, type Settings } from '@/data/settings';
import { getDb } from '@/db/client';
import { parseTime } from '@/domain/notifications';
import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { notificationsAllowed, requestNotifications, syncNotifications } from '@/notify';
import { Banner, Card, Chip, Divider, Header, Screen, SectionTitle, SwitchRow, T } from '@/ui/kit';
import { space } from '@/ui/theme';

const THRESHOLDS = [60, 70, 80, 90];
const TIMES = ['20:00', '21:00', '22:00', '23:00'];

export default function NotificationSettings() {
  const t = useT();
  const settings = useSettings();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    notificationsAllowed()
      .then(setAllowed)
      .catch(() => setAllowed(false));
  }, []);

  const set = async (patch: Partial<Settings>, turningOn: boolean) => {
    updateSettings(getDb(), patch);
    if (turningOn) setAllowed(await requestNotifications());
    await syncNotifications(getDb());
  };
  const reminder = parseTime(settings.dailyReminderTime);

  return (
    <Screen header={<Header back title={t('settings.notifications')} />}>
      {allowed === false ? (
        <Banner
          tone="warning"
          icon="bell-off-outline"
          title={t('notify.blockedTitle')}
          body={t('notify.blockedBody')}
          actionLabel={t('notify.openSettings')}
          onAction={() => void Linking.openSettings()}
        />
      ) : null}
      <Card padded={false}>
        <SwitchRow
          icon="chart-donut"
          title={t('notify.budgets')}
          subtitle={t('notify.budgetsSub', { percent: settings.budgetWarningPercent })}
          value={settings.notifyBudgets}
          onChange={(value) => void set({ notifyBudgets: value }, value)}
        />
        <Divider />
        <SwitchRow
          icon="credit-card-clock-outline"
          title={t('notify.bills')}
          subtitle={t('notify.billsSub')}
          value={settings.notifyBills}
          onChange={(value) => void set({ notifyBills: value }, value)}
        />
        <Divider />
        <SwitchRow
          icon="repeat"
          title={t('notify.recurring')}
          subtitle={t('notify.recurringSub')}
          value={settings.notifyRecurring}
          onChange={(value) => void set({ notifyRecurring: value }, value)}
        />
        <Divider />
        <SwitchRow
          icon="notebook-edit-outline"
          title={t('notify.daily')}
          subtitle={t('notify.dailySub')}
          value={settings.dailyReminder}
          onChange={(value) => void set({ dailyReminder: value }, value)}
        />
        <Divider />
        <SwitchRow
          icon="export-variant"
          title={t('notify.export')}
          subtitle={t('notify.exportSub')}
          value={settings.exportReminder}
          onChange={(value) => void set({ exportReminder: value }, value)}
        />
      </Card>

      <SectionTitle>{t('notify.threshold')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {THRESHOLDS.map((percent) => (
          <Chip
            key={percent}
            label={`${percent}%`}
            selected={settings.budgetWarningPercent === percent}
            onPress={() => void set({ budgetWarningPercent: percent }, false)}
          />
        ))}
      </View>
      <T variant="caption" tone="muted">
        {t('notify.thresholdNote')}
      </T>

      {settings.dailyReminder ? (
        <>
          <SectionTitle>{t('notify.dailyTime')}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TIMES.map((time) => (
              <Chip
                key={time}
                label={time}
                selected={
                  parseTime(time).hour === reminder.hour &&
                  parseTime(time).minute === reminder.minute
                }
                onPress={() => void set({ dailyReminderTime: time }, false)}
              />
            ))}
          </View>
        </>
      ) : null}
      <T variant="caption" tone="muted">
        {t('notify.localNote')}
      </T>
    </Screen>
  );
}
