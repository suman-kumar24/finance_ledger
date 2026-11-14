import { router } from 'expo-router';

import { countInbox } from '@/data/sms';
import { useLive } from '@/data/useLive';
import { dayFromTimestamp } from '@/domain/dates';
import { useSettings } from '@/hooks/useSettings';
import { dayLabel, useT } from '@/i18n';
import { smsSupported } from '@/sms/native';
import { Card, Divider, Row, SectionTitle } from '@/ui/kit';

/** Settings rows for the user's data: backup, export and import, and (full build only) SMS import. */
export function SettingsExtras() {
  const t = useT();
  const settings = useSettings();
  const pending = useLive(countInbox);
  return (
    <>
      <SectionTitle>{t('settings.sectionData')}</SectionTitle>
      <Card padded={false}>
        <Row
          icon="cloud-upload-outline"
          title={t('backup.title')}
          subtitle={
            settings.backupEnabled
              ? settings.lastBackupAt
                ? t('backup.lastShort', {
                    date: dayLabel(t, dayFromTimestamp(settings.lastBackupAt)),
                  })
                : t('backup.never')
              : t('backup.off')
          }
          onPress={() => router.push('/settings/backup')}
        />
        <Divider />
        <Row
          icon="swap-vertical-bold"
          title={t('export.title')}
          subtitle={t('export.sub')}
          onPress={() => router.push('/settings/export')}
        />
        {smsSupported() ? (
          <>
            <Divider />
            <Row
              icon="message-text-lock-outline"
              title={t('sms.title')}
              subtitle={settings.smsEnabled ? t('sms.pending', { count: pending }) : t('sms.off')}
              onPress={() => router.push('/settings/sms')}
            />
          </>
        ) : null}
      </Card>
    </>
  );
}
