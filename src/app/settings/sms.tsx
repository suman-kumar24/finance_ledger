import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { clearSmsData, countInbox, getAccountMap } from '@/data/sms';
import { listAccounts } from '@/data/accounts';
import { updateSettings } from '@/data/settings';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { scanSms } from '@/features/smsSync';
import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { requestSmsPermission, smsListenSupported, smsSupported } from '@/sms/native';
import { useUi } from '@/state/ui';
import {
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  Row,
  Screen,
  SectionTitle,
  SwitchRow,
  T,
} from '@/ui/kit';
import { space } from '@/ui/theme';

export default function SmsSettings() {
  const t = useT();
  const settings = useSettings();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const [busy, setBusy] = useState(false);
  const supported = smsSupported();
  const data = useLive((db) => ({
    pending: countInbox(db),
    map: [...getAccountMap(db).entries()],
    accounts: listAccounts(db, { includeArchived: true }),
  }));

  if (!supported) {
    return (
      <Screen header={<Header back title={t('sms.title')} />}>
        <Card>
          <EmptyState
            icon="message-off-outline"
            title={t('sms.unsupportedTitle')}
            body={t('sms.unsupportedBody')}
          />
        </Card>
      </Screen>
    );
  }

  const scan = async () => {
    setBusy(true);
    try {
      const stats = await scanSms(getDb());
      showSnackbar(
        stats
          ? t('sms.scanResult', { added: stats.added, ignored: stats.ignored })
          : t('sms.scanNothing'),
      );
    } catch {
      showSnackbar(t('sms.scanFailed'));
    } finally {
      setBusy(false);
    }
  };

  const turnOn = async () => {
    // The explanation is on screen above this button; the system prompt comes only now.
    const granted = await requestSmsPermission(false);
    if (!granted) {
      showSnackbar(t('sms.permissionDenied'));
      return;
    }
    updateSettings(getDb(), { smsEnabled: true });
    await scan();
  };

  const turnOff = () => {
    Alert.alert(t('sms.turnOffTitle'), t('sms.turnOffBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('sms.turnOff'), style: 'destructive', onPress: () => clearSmsData(getDb()) },
    ]);
  };

  const setListen = async (value: boolean) => {
    if (value && !(await requestSmsPermission(true))) return;
    updateSettings(getDb(), { smsListenNew: value });
  };

  return (
    <Screen header={<Header back title={t('sms.title')} />}>
      <Card style={{ gap: space.md }}>
        <T variant="heading">{t('sms.whatTitle')}</T>
        <T tone="muted">{t('sms.whatBody')}</T>
        <View style={{ gap: space.sm }}>
          {(['sms.point1', 'sms.point2', 'sms.point3', 'sms.point4', 'sms.point5'] as const).map(
            (key) => (
              <View key={key} style={{ flexDirection: 'row', gap: space.sm }}>
                <T tone="accent">•</T>
                <T style={{ flex: 1 }}>{t(key)}</T>
              </View>
            ),
          )}
        </View>
        {settings.smsEnabled ? (
          <Button label={t('sms.turnOff')} variant="ghost" onPress={turnOff} />
        ) : (
          <Button
            label={t('sms.turnOn')}
            icon="message-text-lock-outline"
            onPress={() => void turnOn()}
          />
        )}
      </Card>

      {settings.smsEnabled ? (
        <>
          {data.pending > 0 ? (
            <Banner
              tone="accent"
              icon="inbox-arrow-down-outline"
              title={t('sms.pending', { count: data.pending })}
              actionLabel={t('sms.review')}
              onAction={() => router.push('/sms-inbox')}
            />
          ) : null}
          <Card padded={false}>
            <Row
              icon="inbox-arrow-down-outline"
              title={t('sms.inbox')}
              subtitle={t('sms.pending', { count: data.pending })}
              onPress={() => router.push('/sms-inbox')}
            />
            <Divider />
            <Row
              icon="refresh"
              title={busy ? t('sms.scanning') : t('sms.scanNow')}
              subtitle={t('sms.scanSub')}
              onPress={busy ? undefined : () => void scan()}
            />
            {smsListenSupported() ? (
              <>
                <Divider />
                <SwitchRow
                  icon="message-flash-outline"
                  title={t('sms.listen')}
                  subtitle={t('sms.listenSub')}
                  value={settings.smsListenNew}
                  onChange={(value) => void setListen(value)}
                />
              </>
            ) : null}
          </Card>

          <SectionTitle>{t('sms.mapTitle')}</SectionTitle>
          <Card padded={false}>
            {data.map.length === 0 ? (
              <EmptyState
                icon="link-variant"
                title={t('sms.mapEmpty')}
                body={t('sms.mapEmptyBody')}
              />
            ) : (
              data.map.map(([last4, accountId], index) => (
                <View key={last4}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    icon="link-variant"
                    title={`··${last4}`}
                    subtitle={
                      data.accounts.find((a) => a.id === accountId)?.name ?? t('account.notFound')
                    }
                    right={<View />}
                  />
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
