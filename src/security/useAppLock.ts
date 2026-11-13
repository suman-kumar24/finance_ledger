import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useUi } from '@/state/ui';

/** Lock again after the app has been in the background this long. */
const RELOCK_AFTER_MS = 30_000;

/** Locks the app at start-up and after time in the background. */
export function useAppLock(enabled: boolean): void {
  const setLocked = useUi((s) => s.setLocked);
  const leftAt = useRef<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      if (enabled) setLocked(true);
    }
    if (!enabled) {
      setLocked(false);
      return undefined;
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        leftAt.current ??= Date.now();
      } else if (state === 'active') {
        if (leftAt.current !== null && Date.now() - leftAt.current > RELOCK_AFTER_MS) {
          setLocked(true);
        }
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled, setLocked]);
}

/** FLAG_SECURE: hides the app in the recent-apps view and blocks screenshots. */
export function useScreenSecurity(enabled: boolean): void {
  useEffect(() => {
    const apply = enabled
      ? ScreenCapture.preventScreenCaptureAsync('ledger')
      : ScreenCapture.allowScreenCaptureAsync('ledger');
    apply.catch(() => undefined);
  }, [enabled]);
}
