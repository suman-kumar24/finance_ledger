import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { listContributions, listGoals, listPurchases } from '@/data/plans';
import { listRecurringRules } from '@/data/recurring';
import { useLive } from '@/data/useLive';
import { goalProgress } from '@/domain/goals';
import { monthlyEquivalent } from '@/domain/recurring';
import { PRIORITY_LABEL, PURCHASE_STATUS } from '@/features/planLabels';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { Ring } from '@/ui/charts';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  Icon,
  Pill,
  Row,
  Screen,
  SectionTitle,
  T,
} from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

export default function Plans() {
  const t = useT();
  const c = useTheme();
  const { money } = useMoney();
  const today = useToday();
  const data = useLive((db) => ({
    goals: listGoals(db),
    contributions: listContributions(db),
    purchases: listPurchases(db),
    rules: listRecurringRules(db).filter((r) => r.active),
  }));
  const committed = data.rules
    .filter((r) => r.type === 'expense' || r.type === 'transfer')
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0);
  const open = data.purchases.filter((p) => p.status !== 'bought');
  const plannedTotal = open.reduce((sum, p) => sum + p.estimatedPrice, 0);

  return (
    <Screen header={<Header title={t('tab.plans')} />}>
      <View style={{ gap: space.sm }}>
        <SectionTitle
          action={
            <Button
              label={t('goal.add')}
              icon="plus"
              variant="ghost"
              compact
              onPress={() => router.push('/goal')}
            />
          }
        >
          {t('goal.title')}
        </SectionTitle>
        {data.goals.length === 0 ? (
          <Card>
            <EmptyState icon="target" title={t('goal.emptyTitle')} body={t('goal.emptyBody')} />
          </Card>
        ) : (
          data.goals.map((goal) => {
            const p = goalProgress(
              goal,
              data.contributions.filter((item) => item.goalId === goal.id),
              today,
            );
            const line =
              p.state === 'reached'
                ? t('goal.reached')
                : p.state === 'past_due'
                  ? t('goal.pastDue', { amount: money(p.remaining, { fraction: 'never' }) })
                  : p.monthlyNeeded !== null
                    ? t('goal.perMonth', { amount: money(p.monthlyNeeded, { fraction: 'never' }) })
                    : t('goal.noDate');
            return (
              <Pressable
                key={goal.id}
                accessibilityRole="button"
                accessibilityLabel={`${goal.name}, ${t('goal.progressA11y', {
                  saved: money(p.saved),
                  target: money(goal.targetAmount),
                  percent: p.percent,
                })}, ${line}`}
                accessibilityHint={t('goal.openHint')}
                onPress={() => router.push({ pathname: '/goal', params: { id: goal.id } })}
              >
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                  <Ring fraction={p.fraction} color={goal.color} label={`${p.percent}%`}>
                    <T variant="label" numeric maxFontSizeMultiplier={1.2}>
                      {Math.min(p.percent, 999)}%
                    </T>
                  </Ring>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="heading" numberOfLines={1}>
                      {goal.name}
                    </T>
                    <T numeric tone="muted">
                      {money(p.saved, { fraction: 'never' })} /{' '}
                      {money(goal.targetAmount, { fraction: 'never' })}
                    </T>
                    {p.state === 'reached' ? (
                      <Pill tone="positive" icon="check-circle-outline" label={line} />
                    ) : p.state === 'past_due' ? (
                      <Pill tone="warning" icon="alert-outline" label={line} />
                    ) : (
                      <T variant="label" tone={p.monthlyNeeded !== null ? 'accent' : 'muted'}>
                        {line}
                        {goal.targetDate && p.state === 'active'
                          ? ` · ${t('goal.by', { date: dayLabel(t, goal.targetDate, today) })}`
                          : ''}
                      </T>
                    )}
                  </View>
                  <Icon name="chevron-right" color={c.textMuted} />
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle
          action={
            <Button
              label={t('purchase.add')}
              icon="plus"
              variant="ghost"
              compact
              onPress={() => router.push('/purchase')}
            />
          }
        >
          {t('purchase.title')}
        </SectionTitle>
        <Card padded={false}>
          {data.purchases.length === 0 ? (
            <EmptyState
              icon="cart-heart"
              title={t('purchase.emptyTitle')}
              body={t('purchase.emptyBody')}
            />
          ) : (
            data.purchases.map((purchase, index) => {
              const status = PURCHASE_STATUS[purchase.status];
              return (
                <View key={purchase.id}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${purchase.name}, ${money(purchase.estimatedPrice)}, ${t(status.key)}, ${t(PRIORITY_LABEL[purchase.priority])}`}
                    onPress={() =>
                      router.push({ pathname: '/purchase', params: { id: purchase.id } })
                    }
                    android_ripple={{ color: c.scrim }}
                    style={{
                      minHeight: 64,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingHorizontal: space.lg,
                      paddingVertical: space.sm,
                      opacity: purchase.status === 'bought' ? 0.6 : 1,
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <T style={{ fontWeight: '500' }} numberOfLines={1}>
                        {purchase.name}
                      </T>
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: space.sm,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Pill tone={status.tone} icon={status.icon} label={t(status.key)} />
                        {purchase.status !== 'bought' ? (
                          <T variant="caption" tone="muted">
                            {t(PRIORITY_LABEL[purchase.priority])}
                          </T>
                        ) : null}
                      </View>
                    </View>
                    <T numeric style={{ fontWeight: '600' }}>
                      {money(purchase.estimatedPrice, { fraction: 'never' })}
                    </T>
                  </Pressable>
                </View>
              );
            })
          )}
        </Card>
        {open.length > 1 ? (
          <T variant="caption" tone="muted" center>
            {t('purchase.totalPlanned', { amount: money(plannedTotal, { fraction: 'never' }) })}
          </T>
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle>{t('plans.commitments')}</SectionTitle>
        <Card padded={false}>
          <Row
            icon="repeat"
            title={
              data.rules.length === 0
                ? t('recurring.emptyTitle')
                : t('plans.commitmentsLine', {
                    count: data.rules.length,
                    amount: money(committed, { fraction: 'never' }),
                  })
            }
            subtitle={t('settings.recurringSub')}
            onPress={() => router.push('/settings/recurring')}
          />
        </Card>
      </View>
    </Screen>
  );
}
