import { memo } from 'react';
import { Pressable, View } from 'react-native';

import type { Lookups } from '@/data/queries';
import type { Transaction } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { dayLabel, useT } from '@/i18n';
import { Avatar, Icon, T } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

import { describeTransaction, SOURCE_LABEL, TYPE_LABEL } from './txDisplay';

export const TransactionRow = memo(function TransactionRow({
  tx,
  lookups,
  onPress,
  onLongPress,
  onDelete,
  showDay,
}: {
  tx: Transaction;
  lookups: Lookups;
  onPress?: (tx: Transaction) => void;
  onLongPress?: (tx: Transaction) => void;
  onDelete?: (tx: Transaction) => void;
  showDay?: boolean;
}) {
  const c = useTheme();
  const t = useT();
  const { money } = useMoney();
  const d = describeTransaction(tx, lookups, t);
  const amount = money(Math.abs(d.signed), { sign: 'never' });
  const prefix = d.sign === 'never' ? '' : d.signed < 0 ? '−' : d.sign === 'always' ? '+' : '';
  const scheduled = tx.status === 'scheduled';
  const label = [
    t(TYPE_LABEL[tx.type]),
    `${prefix}${amount}`,
    d.title,
    d.subtitle,
    dayLabel(t, tx.day),
    scheduled ? t('tx.scheduled') : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={onPress ? t('tx.rowHint') : undefined}
      accessibilityActions={onDelete ? [{ name: 'delete', label: t('common.delete') }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') onDelete?.(tx);
      }}
      onPress={onPress ? () => onPress(tx) : undefined}
      onLongPress={onLongPress ? () => onLongPress(tx) : undefined}
      android_ripple={{ color: c.scrim }}
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        backgroundColor: c.surface,
        opacity: scheduled ? 0.75 : 1,
      }}
    >
      <Avatar icon={d.icon} color={d.color ?? c.textMuted} />
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '500' }} numberOfLines={1}>
          {d.title}
        </T>
        <T variant="caption" tone="muted" numberOfLines={1}>
          {showDay ? `${dayLabel(t, tx.day)} · ` : ''}
          {d.subtitle}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <T numeric tone={d.tone === 'muted' ? 'default' : d.tone} style={{ fontWeight: '600' }}>
          {prefix}
          {amount}
        </T>
        {scheduled ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Icon name="clock-outline" size={12} color={c.textMuted} />
            <T variant="caption" tone="muted">
              {t('tx.scheduled')}
            </T>
          </View>
        ) : tx.source !== 'manual' ? (
          <T variant="caption" tone="muted">
            {t(SOURCE_LABEL[tx.source])}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
});
