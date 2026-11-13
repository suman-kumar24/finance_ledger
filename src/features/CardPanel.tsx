import { router } from 'expo-router';
import { View } from 'react-native';

import type { BillState, CardStatus } from '@/domain/cards';
import type { Account } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { dayLabel, useT, type StringKey } from '@/i18n';
import { Button, Pill, ProgressBar, T, type PillTone } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

const BILL_PILL: Record<BillState, { tone: PillTone; icon: string; key: StringKey }> = {
  none: { tone: 'neutral', icon: 'check-circle-outline', key: 'card.noBill' },
  paid: { tone: 'positive', icon: 'check-circle-outline', key: 'card.paid' },
  due: { tone: 'accent', icon: 'calendar-clock-outline', key: 'card.due' },
  due_soon: { tone: 'warning', icon: 'alert-outline', key: 'card.dueSoon' },
  due_today: { tone: 'warning', icon: 'alert-outline', key: 'card.dueToday' },
  overdue: { tone: 'danger', icon: 'alert-octagon-outline', key: 'card.overdue' },
};

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'default';
}) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <T variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </T>
      <T variant="heading" numeric numberOfLines={1} adjustsFontSizeToFit tone={tone ?? 'default'}>
        {value}
      </T>
    </View>
  );
}

/** A credit card's position: outstanding, unbilled, current bill, due date and utilisation. */
export function CardPanel({
  card,
  status,
  today,
}: {
  card: Account;
  status: CardStatus;
  today: string;
}) {
  const t = useT();
  const c = useTheme();
  const { money } = useMoney();
  const pill = BILL_PILL[status.billState];
  const utilPercent = Math.round(status.utilisation * 100);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Figure label={t('card.outstanding')} value={money(status.outstanding)} />
        <Figure label={t('card.unbilled')} value={money(status.unbilled)} />
      </View>
      <View
        style={{
          backgroundColor: c.surfaceAlt,
          borderRadius: 12,
          padding: space.md,
          gap: space.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View
            style={{ flex: 1 }}
            accessible
            accessibilityLabel={`${t('card.currentBill')}: ${money(status.currentBill)}`}
          >
            <T variant="caption" tone="muted">
              {t('card.currentBill')}
            </T>
            <T variant="title" numeric>
              {money(status.currentBill)}
            </T>
          </View>
          <Pill tone={pill.tone} icon={pill.icon} label={t(pill.key)} />
        </View>
        {status.statementDate ? (
          <T variant="caption" tone="muted">
            {t('card.statementOn', { date: dayLabel(t, status.statementDate, today) })}
            {status.dueDate
              ? ` · ${t('card.dueOn', { date: dayLabel(t, status.dueDate, today) })}`
              : ''}
            {status.minimumDue !== null
              ? ` · ${t('card.minDue', { amount: money(status.minimumDue) })}`
              : ''}
          </T>
        ) : (
          <T variant="caption" tone="muted">
            {t('card.noCycle')}
          </T>
        )}
        {status.statementTotal > 0 && status.paidSinceStatement > 0 ? (
          <T variant="caption" tone="muted">
            {t('card.paidOfTotal', {
              paid: money(status.paidSinceStatement),
              total: money(status.statementTotal),
            })}
          </T>
        ) : null}
        {status.outstanding > 0 ? (
          <Button
            label={t('card.payBill')}
            icon="credit-card-check-outline"
            variant={status.currentBill > 0 ? 'primary' : 'secondary'}
            onPress={() => router.push({ pathname: '/pay-bill', params: { id: card.id } })}
          />
        ) : null}
      </View>
      {card.creditLimit ? (
        <View style={{ gap: 2 }}>
          <ProgressBar
            value={status.utilisation}
            tone={
              status.utilisation > 0.75 ? 'danger' : status.utilisation > 0.3 ? 'warning' : 'accent'
            }
            label={t('card.utilisationA11y', {
              percent: utilPercent,
              limit: money(card.creditLimit),
            })}
            height={8}
          />
          <T variant="caption" tone="muted">
            {t('card.utilisation', {
              percent: utilPercent,
              limit: money(card.creditLimit, { fraction: 'never' }),
            })}
            {status.availableCredit !== null
              ? ` · ${t('card.available', { amount: money(status.availableCredit, { fraction: 'never' }) })}`
              : ''}
          </T>
        </View>
      ) : null}
    </View>
  );
}
