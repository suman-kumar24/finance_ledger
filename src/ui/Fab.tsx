import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useT } from '@/i18n';

import { Icon } from './kit';
import { space, useTheme } from './theme';

/** The floating "+" that opens quick add. */
export function Fab() {
  const c = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('quick.add')}
      accessibilityHint={t('quick.addHint')}
      onPress={() => router.push('/quick-add')}
      android_ripple={{ color: c.scrim }}
      style={{
        position: 'absolute',
        right: space.lg,
        bottom: space.lg,
        width: 60,
        height: 60,
        borderRadius: 20,
        backgroundColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
        overflow: 'hidden',
      }}
    >
      <Icon name="plus" size={30} color={c.onAccent} />
    </Pressable>
  );
}
