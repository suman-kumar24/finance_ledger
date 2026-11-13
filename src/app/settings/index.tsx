import { router } from 'expo-router';
import { Alert } from 'react-native';

import { wipeAllData } from '@/data/wipe';
import { getDb } from '@/db/client';
import { SettingsExtras } from '@/features/SettingsExtras';
import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { clearPin } from '@/security/pin';
import { useUi } from '@/state/ui';
import { Card, Divider, Header, Row, Screen, SectionTitle, T } from '@/ui/kit';

export default function Settings() {
  const t = useT();
  const settings = useSettings();
  const setFilter = useUi((s) => s.setFilter);
  const setPeriodKey = useUi((s) => s.setPeriodKey);

  const deleteAll = () => {
    Alert.alert(t('settings.deleteAllTitle'), t('settings.deleteAllBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAllNext'),
        style: 'destructive',
        onPress: () =>
          // A second confirmation, because this cannot be undone.
          Alert.alert(t('settings.deleteAllConfirmTitle'), t('settings.deleteAllConfirmBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('settings.deleteAllConfirm'),
              style: 'destructive',
              onPress: () => {
                wipeAllData(getDb());
                void clearPin();
                setFilter({});
                setPeriodKey(null);
                router.dismissAll();
                router.replace('/onboarding');
              },
            },
          ]),
      },
    ]);
  };

  return (
    <Screen header={<Header back title={t('settings.title')} />}>
      <SectionTitle>{t('settings.sectionMoney')}</SectionTitle>
      <Card padded={false}>
        <Row
          icon="shape-outline"
          title={t('settings.categories')}
          subtitle={t('settings.categoriesSub')}
          onPress={() => router.push('/settings/categories')}
        />
        <Divider />
        <Row
          icon="chart-donut"
          title={t('settings.budgets')}
          subtitle={t('settings.budgetsSub')}
          onPress={() => router.push('/settings/budgets')}
        />
        <Divider />
        <Row
          icon="repeat"
          title={t('settings.recurring')}
          subtitle={t('settings.recurringSub')}
          onPress={() => router.push('/settings/recurring')}
        />
      </Card>

      <SectionTitle>{t('settings.sectionApp')}</SectionTitle>
      <Card padded={false}>
        <Row
          icon="tune-variant"
          title={t('settings.general')}
          subtitle={`${settings.currency} · ${settings.language === 'hi' ? 'हिन्दी' : 'English'}`}
          onPress={() => router.push('/settings/general')}
        />
        <Divider />
        <Row
          icon="bell-outline"
          title={t('settings.notifications')}
          subtitle={t('settings.notificationsSub')}
          onPress={() => router.push('/settings/notifications')}
        />
        <Divider />
        <Row
          icon="shield-lock-outline"
          title={t('settings.security')}
          subtitle={settings.lockEnabled ? t('lock.isOn') : t('lock.isOff')}
          onPress={() => router.push('/settings/security')}
        />
      </Card>

      <SettingsExtras />

      <SectionTitle>{t('settings.sectionDanger')}</SectionTitle>
      <Card padded={false}>
        <Row
          icon="delete-forever-outline"
          danger
          title={t('settings.deleteAll')}
          subtitle={t('settings.deleteAllSub')}
          onPress={deleteAll}
        />
      </Card>
      <T variant="caption" tone="muted" center>
        {t('settings.privacyNote')}
      </T>
    </Screen>
  );
}
