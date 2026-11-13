import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { AmountPad } from '@/ui/AmountPad';
import { Button, Icon, T } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

import { lockoutSeconds, PIN_MAX, PIN_MIN, verifyPin } from './pin';

/** Dots that show how many PIN digits have been typed, without revealing them. */
export function PinDots({ length }: { length: number }) {
  const c = useTheme();
  const t = useT();
  return (
    <View
      accessible
      accessibilityLabel={t('lock.digitsEntered', { count: length })}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: space.md, height: 24, alignItems: 'center' }}
    >
      {Array.from({ length: Math.max(PIN_MIN, length) }, (_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: c.accent,
            backgroundColor: i < length ? c.accent : 'transparent',
          }}
        />
      ))}
    </View>
  );
}

/** Full-screen lock shown over the app until the user proves who they are. */
export function LockScreen() {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { biometricEnabled } = useSettings();
  const setLocked = useUi((s) => s.setLocked);
  const [pin, setPin] = useState('');
  const [failed, setFailed] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const waiting = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  useEffect(() => {
    if (waiting <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [waiting]);

  const tryBiometric = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('lock.biometricPrompt'),
        cancelLabel: t('lock.usePin'),
        disableDeviceFallback: true,
      });
      if (result.success) setLocked(false);
    } catch {
      // fall back to the PIN
    }
  }, [setLocked, t]);

  useEffect(() => {
    if (biometricEnabled) void tryBiometric();
  }, [biometricEnabled, tryBiometric]);

  const submit = async () => {
    if (waiting > 0 || pin.length < PIN_MIN) return;
    const ok = await verifyPin(pin);
    setPin('');
    if (ok) {
      setFailed(0);
      setLocked(false);
      return;
    }
    const next = failed + 1;
    setFailed(next);
    const wait = lockoutSeconds(next);
    if (wait > 0) {
      setWaitUntil(Date.now() + wait * 1000);
      setNow(Date.now());
    }
    setError(t('lock.wrongPin'));
  };

  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: c.bg,
        paddingTop: insets.top + space.xxl,
        paddingBottom: insets.bottom + space.lg,
        paddingHorizontal: space.xl,
        alignItems: 'center',
        gap: space.lg,
      }}
    >
      <Icon name="lock-outline" size={40} color={c.accent} />
      <T variant="title" accessibilityRole="header">
        {t('lock.title')}
      </T>
      <PinDots length={pin.length} />
      <T tone={waiting > 0 || error ? 'danger' : 'muted'} center accessibilityLiveRegion="polite">
        {waiting > 0 ? t('lock.wait', { seconds: waiting }) : (error ?? t('lock.enterPin'))}
      </T>
      <View style={{ flex: 1 }} />
      <View style={{ width: '100%', maxWidth: 360, gap: space.md }}>
        <AmountPad
          value={pin}
          digitsOnly
          onChange={(value) => {
            setError(null);
            setPin(value.slice(0, PIN_MAX));
          }}
        />
        <Button
          label={t('lock.unlock')}
          onPress={submit}
          disabled={pin.length < PIN_MIN || waiting > 0}
        />
        {biometricEnabled ? (
          <Button
            label={t('lock.useBiometric')}
            icon="fingerprint"
            variant="ghost"
            onPress={tryBiometric}
          />
        ) : null}
      </View>
    </View>
  );
}
