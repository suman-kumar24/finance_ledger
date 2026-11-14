import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/backup/background';
import { runAutoBackup } from '@/backup/service';
import { runMaintenance } from '@/data/maintenance';
import { getDb, initDatabase } from '@/db/client';
import { scanSms, startSmsListener } from '@/features/smsSync';
import { dayFromDate } from '@/domain/dates';
import { useSettings } from '@/hooks/useSettings';
import { syncNotifications } from '@/notify';
import { LockScreen } from '@/security/LockScreen';
import { useAppLock, useScreenSecurity } from '@/security/useAppLock';
import { useUi } from '@/state/ui';
import { Button, T } from '@/ui/kit';
import { SnackbarHost } from '@/ui/Snackbar';
import { useTheme } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

/** Shown instead of a blank screen if any screen throws. Data is untouched. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View
      style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}
      accessibilityRole="alert"
    >
      <T variant="title">Something went wrong</T>
      <T tone="muted">
        Your data is safe on this phone. Try again; if it keeps happening, restart the app.
      </T>
      <T variant="caption" tone="muted">
        {error.message}
      </T>
      <Button label="Try again" onPress={() => void retry()} />
    </View>
  );
}

function AppShell() {
  const settings = useSettings();
  const c = useTheme();
  const locked = useUi((s) => s.locked);
  useAppLock(settings.lockEnabled);
  useScreenSecurity(settings.screenSecure);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runMaintenance(getDb(), dayFromDate(new Date()));
        void syncNotifications(getDb());
        void scanSms(getDb()).catch(() => null);
        void runAutoBackup(getDb());
      }
    });
    return () => sub.remove();
  }, []);

  // SMS import is opt-in; both of these do nothing unless it is switched on.
  useEffect(() => {
    void scanSms(getDb()).catch(() => null);
    return startSmsListener(getDb());
  }, [settings.smsEnabled, settings.smsListenNew]);

  const base = c.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.border,
      notification: c.danger,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="quick-add"
          options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}
        />
      </Stack>
      <SnackbarHost />
      {locked ? <LockScreen /> : null}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then((db) => {
        runMaintenance(db, dayFromDate(new Date()));
        void syncNotifications(db);
        void runAutoBackup(db);
        setReady(true);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        void SplashScreen.hideAsync();
      });
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <T variant="heading">Ledger could not open its database.</T>
        <T tone="muted">{error}</T>
      </View>
    );
  }
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
