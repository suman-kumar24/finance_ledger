import { router } from 'expo-router';

import { countInbox } from '@/data/sms';
import { useLive } from '@/data/useLive';
import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { smsSupported } from '@/sms/native';
import { Card, Row, SectionTitle } from '@/ui/kit';

/** Settings rows for data: SMS import now; backup and export join in Phase 8. */
export function SettingsExtras() {
  const t = useT();
  const settings = useSettings();
  const pending = useLive(countInbox);
  if (!smsSupported()) return null;
  return (
    <>
      <SectionTitle>{t('settings.sectionData')}</SectionTitle>
      <Card padded={false}>
        <Row
          icon="message-text-lock-outline"
          title={t('sms.title')}
          subtitle={settings.smsEnabled ? t('sms.pending', { count: pending }) : t('sms.off')}
          onPress={() => router.push('/settings/sms')}
        />
      </Card>
    </>
  );
}
