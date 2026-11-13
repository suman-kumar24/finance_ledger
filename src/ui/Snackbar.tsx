import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUi } from '@/state/ui';

import { T } from './kit';
import { radius, space, TOUCH, useTheme } from './theme';

const VISIBLE_MS = 6000;

/** One global snackbar, used for "Deleted · Undo" and short confirmations. */
export function SnackbarHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const snackbar = useUi((s) => s.snackbar);
  const hide = useUi((s) => s.hideSnackbar);

  useEffect(() => {
    if (!snackbar) return undefined;
    const timer = setTimeout(hide, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [snackbar, hide]);

  if (!snackbar) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: insets.bottom + 84 }}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{
          backgroundColor: c.dark ? '#E7F0EC' : '#1B2622',
          borderRadius: radius.md,
          paddingLeft: space.lg,
          paddingRight: space.xs,
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          elevation: 6,
        }}
      >
        <T style={{ flex: 1, color: c.dark ? '#13201C' : '#F2F6F4' }}>{snackbar.message}</T>
        {snackbar.actionLabel && snackbar.onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={snackbar.actionLabel}
            onPress={() => {
              snackbar.onAction?.();
              hide();
            }}
            style={{
              minHeight: TOUCH,
              minWidth: TOUCH,
              paddingHorizontal: space.md,
              justifyContent: 'center',
            }}
          >
            <T variant="label" style={{ color: c.dark ? '#0F6B5A' : '#7FE0C3' }}>
              {snackbar.actionLabel}
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
