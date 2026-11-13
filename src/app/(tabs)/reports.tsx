import { useState } from 'react';
import { View } from 'react-native';

import { currentPeriodKey, loadReports } from '@/data/queries';
import { useLive } from '@/data/useLive';
import { UNCATEGORIZED } from '@/domain/spending';
import { useMoney } from '@/hooks/useMoney';
import { useSettings } from '@/hooks/useSettings';
import { useToday } from '@/hooks/useToday';
import { periodLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { GroupedBars } from '@/ui/charts';
import {
  Avatar,
  Card,
  Divider,
  EmptyState,
  Header,
  Icon,
  Screen,
  SectionTitle,
  Segmented,
  T,
} from '@/ui/kit';
import { MonthSwitcher } from '@/ui/MonthSwitcher';
import { space, useTheme } from '@/ui/theme';

type Range = '6' | '12';

export default function Reports() {
  const t = useT();
  const c = useTheme();
  const { money, compact } = useMoney();
  const settings = useSettings();
  const today = useToday();
  const [range, setRange] = useState<Range>('6');
  const currentKey = currentPeriodKey(settings, today);
  const selectedKey = useUi((s) => s.periodKey) ?? currentKey;
  const setPeriodKey = useUi((s) => s.setPeriodKey);
  const view = useLive(
    (db) => loadReports(db, settings, today, Number(range), selectedKey),
    [settings.monthStartDay, today, range, selectedKey],
  );

  const series = [
    { key: 'spending', label: t('reports.spending'), color: c.danger },
    { key: 'income', label: t('reports.income'), color: c.positive },
    { key: 'saved', label: t('reports.saved'), color: c.accent },
  ];
  const hasTrend = view.trend.some((p) => p.spending > 0 || p.income > 0 || p.saved !== 0);
  const nameOf = (id: string) =>
    id === UNCATEGORIZED
      ? t('common.uncategorized')
      : (view.lookups.categoryById.get(id)?.name ?? t('common.uncategorized'));
  const latest = view.trend[view.trend.length - 1];
  const summary = latest
    ? t('reports.trendA11y', {
        months: view.trend.length,
        month: periodLabel(t, latest.key),
        spending: money(latest.spending),
        income: money(latest.income),
        saved: money(latest.saved),
      })
    : t('reports.trend');

  return (
    <Screen header={<Header title={t('tab.reports')} />}>
      <View style={{ gap: space.sm }}>
        <SectionTitle>{t('reports.trend')}</SectionTitle>
        <Segmented<Range>
          label={t('reports.range')}
          value={range}
          onChange={setRange}
          options={[
            { value: '6', label: t('reports.months', { count: 6 }) },
            { value: '12', label: t('reports.months', { count: 12 }) },
          ]}
        />
        <Card style={{ gap: space.md }}>
          {hasTrend ? (
            <>
              <GroupedBars
                summary={summary}
                series={series}
                formatAxis={(value) => compact(value, { symbol: false })}
                groups={view.trend.map((p) => ({
                  label: periodLabel(t, p.key, true).split(' ')[0] ?? '',
                  values: [p.spending, p.income, p.saved],
                  highlighted: p.key === selectedKey,
                }))}
              />
              <View>
                {[...view.trend]
                  .reverse()
                  .slice(0, range === '6' ? 6 : 12)
                  .map((p, index) => (
                    <View key={p.key}>
                      {index > 0 ? <Divider /> : null}
                      <View
                        accessible
                        accessibilityLabel={t('reports.rowA11y', {
                          month: periodLabel(t, p.key),
                          spending: money(p.spending),
                          income: money(p.income),
                          saved: money(p.saved),
                        })}
                        style={{
                          flexDirection: 'row',
                          paddingVertical: space.sm,
                          gap: space.sm,
                          alignItems: 'center',
                        }}
                      >
                        <T
                          variant="label"
                          style={{ width: 62 }}
                          tone={p.key === selectedKey ? 'accent' : 'default'}
                        >
                          {periodLabel(t, p.key, true)}
                        </T>
                        <T variant="caption" numeric style={{ flex: 1, textAlign: 'right' }}>
                          {compact(p.spending)}
                        </T>
                        <T
                          variant="caption"
                          numeric
                          tone="positive"
                          style={{ flex: 1, textAlign: 'right' }}
                        >
                          {compact(p.income)}
                        </T>
                        <T
                          variant="caption"
                          numeric
                          tone="accent"
                          style={{ flex: 1, textAlign: 'right' }}
                        >
                          {compact(p.saved)}
                        </T>
                      </View>
                    </View>
                  ))}
              </View>
            </>
          ) : (
            <EmptyState
              icon="chart-bar"
              title={t('reports.emptyTitle')}
              body={t('reports.emptyBody')}
            />
          )}
        </Card>
      </View>

      <MonthSwitcher
        period={view.selected}
        currentKey={currentKey}
        showRange={settings.monthStartDay !== 1}
        onChange={(key) => setPeriodKey(key === currentKey ? null : key)}
      />

      <View style={{ gap: space.sm }}>
        <SectionTitle
          action={
            <T variant="label" tone="muted" numeric>
              {money(view.summary.spending, { fraction: 'never' })}
            </T>
          }
        >
          {t('reports.byCategory')}
        </SectionTitle>
        <Card style={{ gap: space.md }}>
          {view.breakdown.length === 0 ? (
            <EmptyState icon="chart-donut" title={t('reports.noSpending')} />
          ) : (
            view.breakdown.map((row) => {
              const category = view.lookups.categoryById.get(row.categoryId);
              const percent = Math.round(row.share * 100);
              return (
                <View
                  key={row.categoryId}
                  accessible
                  accessibilityLabel={t('overview.categoryA11y', {
                    name: nameOf(row.categoryId),
                    amount: money(row.amount),
                    percent,
                  })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
                >
                  <Avatar
                    icon={category?.icon ?? 'help-circle-outline'}
                    color={category?.color ?? c.textMuted}
                    size={36}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      <T style={{ flex: 1, fontWeight: '500' }} numberOfLines={1}>
                        {nameOf(row.categoryId)}
                      </T>
                      <T variant="caption" tone="muted" numeric>
                        {percent}%
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
                          width: `${Math.max(2, row.share * 100)}%`,
                          backgroundColor: category?.color ?? c.textMuted,
                        }}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </View>

      {view.changes.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionTitle>
            {t('reports.change', { month: periodLabel(t, view.previousKey, true) })}
          </SectionTitle>
          <Card padded={false}>
            {view.changes.map((row, index) => {
              const up = row.change > 0;
              const flat = row.change === 0;
              const word = flat ? t('reports.same') : up ? t('reports.up') : t('reports.down');
              return (
                <View key={row.categoryId}>
                  {index > 0 ? <Divider /> : null}
                  <View
                    accessible
                    accessibilityLabel={t('reports.changeA11y', {
                      name: nameOf(row.categoryId),
                      current: money(row.current),
                      previous: money(row.previous),
                      direction: word,
                      amount: money(Math.abs(row.change)),
                    })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.lg,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <T style={{ fontWeight: '500' }} numberOfLines={1}>
                        {nameOf(row.categoryId)}
                      </T>
                      <T variant="caption" tone="muted" numeric>
                        {money(row.previous, { fraction: 'never' })} →{' '}
                        {money(row.current, { fraction: 'never' })}
                      </T>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon
                        name={flat ? 'minus' : up ? 'arrow-up' : 'arrow-down'}
                        size={16}
                        color={flat ? c.textMuted : up ? c.danger : c.positive}
                      />
                      <View style={{ alignItems: 'flex-end' }}>
                        <T
                          numeric
                          style={{ fontWeight: '600' }}
                          tone={flat ? 'muted' : up ? 'danger' : 'positive'}
                        >
                          {money(Math.abs(row.change), { fraction: 'never' })}
                        </T>
                        <T variant="caption" tone="muted">
                          {word}
                          {row.percent !== null && !flat ? ` ${Math.abs(row.percent)}%` : ''}
                        </T>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
