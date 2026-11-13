import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { updateSettings } from '@/data/settings';
import { getDb } from '@/db/client';
import { PinSetup } from '@/features/PinSetup';
import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { clearPin } from '@/security/pin';
import { Button, Card, Divider, Header, Pill, Screen, SwitchRow, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function Security() {
  const t = useT();
  const settings = useSettings();
  const [settingUp, setSettingUp] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hardware, enrolled]) => setBiometricAvailable(hardware && enrolled))
      .catch(() => setBiometricAvailable(false));
  }, []);

  const turnOff = () => {
    Alert.alert(t('lock.turnOffTitle'), t('lock.turnOffBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('lock.turnOff'),
        style: 'destructive',
        onPress: () => {
          updateSettings(getDb(), { lockEnabled: false, biometricEnabled: false });
          void clearPin();
        },
      },
    ]);
  };

  return (
    <Screen header={<Header back title={t('settings.security')} />}>
      <Card style={{ gap: space.md }}>
        <Pill
          tone={settings.lockEnabled ? 'positive' : 'neutral'}
          icon={settings.lockEnabled ? 'lock-outline' : 'lock-open-variant-outline'}
          label={settings.lockEnabled ? t('lock.isOn') : t('lock.isOff')}
        />
        <T tone="muted">{t('lock.explain')}</T>
        {settingUp ? (
          <PinSetup onDone={() => setSettingUp(false)} />
        ) : settings.lockEnabled ? (
          <>
            <Button
              label={t('lock.changePin')}
              icon="form-textbox-password"
              variant="secondary"
              onPress={() => setSettingUp(true)}
            />
            <Button label={t('lock.turnOff')} variant="ghost" onPress={turnOff} />
          </>
        ) : (
          <Button
            label={t('lock.setUp')}
            icon="lock-plus-outline"
            onPress={() => setSettingUp(true)}
          />
        )}
      </Card>

      <Card padded={false}>
        <SwitchRow
          icon="fingerprint"
          title={t('lock.biometricToggle')}
          subtitle={biometricAvailable ? undefined : t('lock.biometricUnavailable')}
          value={settings.biometricEnabled}
          disabled={!settings.lockEnabled || !biometricAvailable}
          onChange={(biometricEnabled) => updateSettings(getDb(), { biometricEnabled })}
        />
        <Divider />
        <SwitchRow
          icon="eye-off-outline"
          title={t('lock.screenSecure')}
          subtitle={t('lock.screenSecureSub')}
          value={settings.screenSecure}
          onChange={(screenSecure) => updateSettings(getDb(), { screenSecure })}
        />
      </Card>
    </Screen>
  );
}
