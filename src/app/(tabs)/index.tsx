import { router } from 'expo-router';
import { View } from 'react-native';

import { currentPeriodKey, loadPeriodView } from '@/data/queries';
import { useLive } from '@/data/useLive';
import { ratio } from '@/domain/money';
import { UNCATEGORIZED } from '@/domain/spending';
import { OverviewExtras } from '@/features/OverviewExtras';
import { useMoney } from '@/hooks/useMoney';
import { useSettings } from '@/hooks/useSettings';
import { useToday } from '@/hooks/useToday';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { BudgetRow } from '@/ui/BudgetRow';
import { Fab } from '@/ui/Fab';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Header,
  IconButton,
  Pill,
  ProgressBar,
  Screen,
  SectionTitle,
  T,
} from '@/ui/kit';
import { MonthSwitcher } from '@/ui/MonthSwitcher';
import { space, useTheme } from '@/ui/theme';

export default function Overview() {
  const t = useT();
  const c = useTheme();
  const { money } = useMoney();
  const settings = useSettings();
  const today = useToday();
  const currentKey = currentPeriodKey(settings, today);
  const selectedKey = useUi((s) => s.periodKey) ?? currentKey;
  const setPeriodKey = useUi((s) => s.setPeriodKey);
  const view = useLive(
    (db) => loadPeriodView(db, selectedKey, settings, today),
    [selectedKey, settings.monthStartDay, settings.budgetWarningPercent, today],
  );

  const { summary, totals, progress, pace } = view;
  const isCurrent = progress.state === 'current';
  const hasBudget = totals.limit > 0;
  const overTotal = hasBudget && summary.spending > totals.limit;
  const paceLabel =
    pace === null
      ? null
      : pace.state === 'ahead'
        ? t('overview.paceAhead')
        : pace.state === 'under'
          ? t('overview.paceUnder')
          : t('overview.paceOn');
  const empty = summary.count === 0 && view.budgets.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        padBottom={72}
        header={
          <Header
            title={t('tab.overview')}
            right={
              <IconButton
                icon="cog-outline"
                label={t('settings.title')}
                onPress={() => router.push('/settings')}
              />
            }
          />
        }
      >
        <MonthSwitcher
          period={view.period}
          currentKey={currentKey}
          showRange={settings.monthStartDay !== 1}
          onChange={(key) => setPeriodKey(key === currentKey ? null : key)}
        />

        <Card>
          <T variant="label" tone="muted">
            {isCurrent ? t('overview.spentThisMonth') : t('overview.spent')}
          </T>
          <T
            variant="display"
            numeric
            adjustsFontSizeToFit
            numberOfLines={1}
            accessibilityLabel={t('overview.spentA11y', { amount: money(summary.spending) })}
          >
            {money(summary.spending, { fraction: 'never' })}
          </T>
          {hasBudget ? (
            <View style={{ gap: space.xs, marginTop: space.sm }}>
              <ProgressBar
                value={ratio(summary.spending, totals.limit)}
                marker={isCurrent ? progress.dayNumber / progress.totalDays : undefined}
                tone={overTotal ? 'danger' : pace?.state === 'ahead' ? 'warning' : 'accent'}
                height={12}
                label={t('overview.budgetUsedA11y', {
                  spent: money(summary.spending),
                  limit: money(totals.limit),
                })}
              />
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: space.sm,
                }}
              >
                <T tone="muted" style={{ flexGrow: 1 }}>
                  {t('overview.ofBudget', { limit: money(totals.limit, { fraction: 'never' }) })}
                  {isCurrent
                    ? ` · ${t('overview.dayOf', { day: progress.dayNumber, total: progress.totalDays })}`
                    : ''}
                </T>
                {overTotal ? (
                  <Pill tone="danger" icon="alert-octagon-outline" label={t('budget.over')} />
                ) : isCurrent && pace && paceLabel ? (
                  <Pill
                    tone={pace.state === 'ahead' ? 'warning' : 'positive'}
                    icon={pace.state === 'ahead' ? 'speedometer' : 'check-circle-outline'}
                    label={paceLabel}
                  />
                ) : null}
              </View>
              {isCurrent && pace && !overTotal && pace.perDayLeft > 0 ? (
                <T variant="caption" tone="muted">
                  {t('overview.perDay', { amount: money(pace.perDayLeft, { fraction: 'never' }) })}
                </T>
              ) : null}
            </View>
          ) : (
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              {isCurrent ? (
                <T tone="muted">
                  {t('overview.dayOf', { day: progress.dayNumber, total: progress.totalDays })}
                </T>
              ) : null}
              {isCurrent ? (
                <Button
                  label={t('overview.setBudget')}
                  icon="chart-donut"
                  variant="secondary"
                  onPress={() => router.push('/settings/budgets')}
                  style={{ alignSelf: 'flex-start' }}
                />
              ) : null}
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              marginTop: space.lg,
              paddingTop: space.md,
              borderTopWidth: 1,
              borderTopColor: c.border,
              gap: space.sm,
            }}
          >
            {(
              [
                ['overview.income', summary.income, 'arrow-down-circle-outline'],
                ['overview.saved', summary.saved, 'piggy-bank-outline'],
                ['overview.left', summary.leftover, 'scale-balance'],
              ] as const
            ).map(([key, amount]) => (
              <View
                key={key}
                style={{ flex: 1 }}
                accessible
                accessibilityLabel={`${t(key)}: ${money(amount)}`}
              >
                <T variant="caption" tone="muted" numberOfLines={1}>
                  {t(key)}
                </T>
                <T
                  variant="heading"
                  numeric
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  tone={key === 'overview.left' && amount < 0 ? 'danger' : 'default'}
                >
                  {money(amount, { fraction: 'never' })}
                </T>
              </View>
            ))}
          </View>
        </Card>

        <OverviewExtras view={view} isCurrent={isCurrent} />

        {empty ? (
          <Card>
            <EmptyState
              icon="notebook-edit-outline"
              title={isCurrent ? t('overview.emptyTitle') : t('overview.emptyPastTitle')}
              body={isCurrent ? t('overview.emptyBody') : undefined}
            />
          </Card>
        ) : null}

        {view.budgets.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <SectionTitle
              action={
                <Button
                  label={t('common.edit')}
                  variant="ghost"
                  compact
                  onPress={() => router.push('/settings/budgets')}
                />
              }
            >
              {t('overview.budgets')}
            </SectionTitle>
            <Card style={{ gap: space.lg }}>
              {view.budgets.map((b) => (
                <BudgetRow key={b.budgetId} status={b} />
              ))}
            </Card>
          </View>
        ) : null}

        {view.topCategories.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <SectionTitle>{t('overview.topCategories')}</SectionTitle>
            <Card style={{ gap: space.md }}>
              {view.topCategories.map((row) => {
                const category = view.lookups.categoryById.get(row.categoryId);
                const name =
                  row.categoryId === UNCATEGORIZED
                    ? t('common.uncategorized')
                    : (category?.name ?? t('common.uncategorized'));
                const share = ratio(row.amount, summary.spending);
                return (
                  <View
                    key={row.categoryId}
                    accessible
                    accessibilityLabel={t('overview.categoryA11y', {
                      name,
                      amount: money(row.amount),
                      percent: Math.round(share * 100),
                    })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
                  >
                    <Avatar
                      icon={category?.icon ?? 'help-circle-outline'}
                      color={category?.color ?? c.textMuted}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', gap: space.sm }}>
                        <T style={{ flex: 1, fontWeight: '500' }} numberOfLines={1}>
                          {name}
                        </T>
                        <T numeric style={{ fontWeight: '600' }}>
                          {money(row.amount, { fraction: 'never' })}
                        </T>
                      </View>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.track }}>
                        <View
                          style={{
                            height: 6,
                            borderRadius: 3,
                            width: `${Math.max(2, share * 100)}%`,
                            backgroundColor: category?.color ?? c.textMuted,
                          }}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        ) : null}
      </Screen>
      <Fab />
    </View>
  );
}
