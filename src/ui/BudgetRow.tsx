import { View } from 'react-native';

import type { BudgetStatus } from '@/domain/budgets';
import { ratio } from '@/domain/money';
import { useMoney } from '@/hooks/useMoney';
import { useT } from '@/i18n';

import { Pill, ProgressBar, T } from './kit';
import { space } from './theme';

/** One budget group: name, progress, what is left, and a status pill. */
export function BudgetRow({ status }: { status: BudgetStatus }) {
  const t = useT();
  const { money } = useMoney();
  const leftText =
    status.remaining >= 0
      ? t('budget.left', { amount: money(status.remaining, { fraction: 'never' }) })
      : t('budget.overBy', { amount: money(-status.remaining, { fraction: 'never' }) });
  return (
    <View
      accessible
      accessibilityLabel={t('budget.rowA11y', {
        name: status.name,
        spent: money(status.spent),
        limit: money(status.limit),
        percent: status.percent,
        state:
          status.state === 'over'
            ? t('budget.over')
            : status.state === 'warning'
              ? t('budget.nearLimit')
              : t('budget.onTrack'),
      })}
      style={{ gap: space.xs }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <T style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
          {status.name}
        </T>
        {status.state === 'over' ? (
          <Pill tone="danger" icon="alert-octagon-outline" label={t('budget.over')} />
        ) : status.state === 'warning' ? (
          <Pill tone="warning" icon="alert-outline" label={t('budget.nearLimit')} />
        ) : (
          <Pill tone="positive" icon="check-circle-outline" label={t('budget.onTrack')} />
        )}
      </View>
      <ProgressBar
        value={ratio(status.spent, status.limit)}
        tone={
          status.state === 'over' ? 'danger' : status.state === 'warning' ? 'warning' : 'accent'
        }
        label={status.name}
      />
      <View style={{ flexDirection: 'row' }}>
        <T variant="caption" tone="muted" numeric style={{ flex: 1 }}>
          {money(status.spent, { fraction: 'never' })} /{' '}
          {money(status.limit, { fraction: 'never' })}
        </T>
        <T variant="caption" numeric tone={status.remaining < 0 ? 'danger' : 'muted'}>
          {leftText}
        </T>
      </View>
    </View>
  );
}
