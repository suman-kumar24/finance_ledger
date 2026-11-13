import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { updateSettings } from '@/data/settings';
import { getDb } from '@/db/client';
import { useT } from '@/i18n';
import { PinDots } from '@/security/LockScreen';
import { isValidPin, PIN_MAX, PIN_MIN, savePin } from '@/security/pin';
import { AmountPad } from '@/ui/AmountPad';
import { Button, SwitchRow, T } from '@/ui/kit';
import { space } from '@/ui/theme';

/** Choose a PIN (typed twice) and optionally allow fingerprint or face unlock. */
export function PinSetup({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometric, setBiometric] = useState(true);

  useEffect(() => {
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hardware, enrolled]) => setBiometricAvailable(hardware && enrolled))
      .catch(() => setBiometricAvailable(false));
  }, []);

  const next = async () => {
    if (!isValidPin(pin)) return;
    if (first === null) {
      setFirst(pin);
      setPin('');
      return;
    }
    if (first !== pin) {
      setError(t('lock.mismatch'));
      setFirst(null);
      setPin('');
      return;
    }
    await savePin(pin);
    updateSettings(getDb(), {
      lockEnabled: true,
      biometricEnabled: biometricAvailable && biometric,
    });
    onDone();
  };

  return (
    <View style={{ gap: space.md, alignItems: 'center' }}>
      <T variant="heading" center accessibilityLiveRegion="polite">
        {first === null ? t('lock.choosePin') : t('lock.repeatPin')}
      </T>
      <PinDots length={pin.length} />
      <T variant="caption" tone={error ? 'danger' : 'muted'} center>
        {error ?? t('lock.pinHint', { min: PIN_MIN, max: PIN_MAX })}
      </T>
      <View style={{ width: '100%', maxWidth: 360, gap: space.md }}>
        <AmountPad
          value={pin}
          digitsOnly
          onChange={(value) => {
            setError(null);
            setPin(value.slice(0, PIN_MAX));
          }}
        />
        {biometricAvailable ? (
          <SwitchRow
            icon="fingerprint"
            title={t('lock.biometricToggle')}
            value={biometric}
            onChange={setBiometric}
          />
        ) : null}
        <Button
          label={first === null ? t('common.next') : t('lock.turnOn')}
          onPress={next}
          disabled={!isValidPin(pin)}
        />
      </View>
    </View>
  );
}
