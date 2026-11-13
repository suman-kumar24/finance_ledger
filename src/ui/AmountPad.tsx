import { Pressable, View } from 'react-native';

import { useT } from '@/i18n';

import { Icon, T } from './kit';
import { radius, space, useTheme } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

/** Applies one key press to the amount text ("1234.5"). */
export function applyKey(current: string, key: string, decimals = 2, digitsOnly = false): string {
  if (key === 'back') return current.slice(0, -1);
  if (digitsOnly) return key === '.' ? current : current + key;
  if (key === '.') {
    if (decimals === 0 || current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  const [whole = '', fraction] = current.split('.');
  if (fraction !== undefined) {
    return fraction.length >= decimals ? current : current + key;
  }
  if (whole.length >= 11) return current;
  if (whole === '0') return key;
  return current + key;
}

/** A numeric keypad for amounts; faster and larger than the system keyboard. */
export function AmountPad({
  value,
  onChange,
  decimals = 2,
  digitsOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  decimals?: number;
  /** PIN entry: plain digits, leading zeros kept, no decimal point. */
  digitsOnly?: boolean;
}) {
  const c = useTheme();
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }} accessibilityLabel={t('quick.pad')}>
      {KEYS.map((key) => (
        <View key={key} style={{ width: '33.333%', padding: 3 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              key === 'back' ? t('quick.backspace') : key === '.' ? t('quick.decimalPoint') : key
            }
            onPress={() => onChange(applyKey(value, key, decimals, digitsOnly))}
            onLongPress={key === 'back' ? () => onChange('') : undefined}
            android_ripple={{ color: c.scrim }}
            style={{
              height: 52,
              borderRadius: radius.md,
              backgroundColor: c.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginHorizontal: space.xs / 2,
            }}
          >
            {key === 'back' ? (
              <Icon name="backspace-outline" size={24} />
            ) : (
              <T variant="title" maxFontSizeMultiplier={1.2}>
                {key}
              </T>
            )}
          </Pressable>
        </View>
      ))}
    </View>
  );
}
