import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { loadLookups } from '@/data/queries';
import type { TransactionFilter } from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { PAYMENT_METHODS, TRANSACTION_SOURCES, TRANSACTION_TYPES } from '@/domain/types';
import { METHOD_LABEL, SOURCE_LABEL, TYPE_LABEL } from '@/features/txDisplay';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { DayPicker } from '@/ui/DayPicker';
import { Button, Chip, Field, Header, Screen, SectionTitle } from '@/ui/kit';
import { space } from '@/ui/theme';

function toggle<V>(list: V[] | undefined, value: V): V[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export default function Filters() {
  const t = useT();
  const today = useToday();
  const { currency } = useMoney();
  const decimals = currencyInfo(currency).decimals;
  const lookups = useLive(loadLookups);
  const applied = useUi((s) => s.filter);
  const setFilter = useUi((s) => s.setFilter);
  const [draft, setDraft] = useState<TransactionFilter>(applied);
  const text = (value: number | null | undefined) =>
    value == null ? '' : toDecimalString(value, decimals).replace(/\.0+$/, '');
  const [min, setMin] = useState(text(applied.minAmount));
  const [max, setMax] = useState(text(applied.maxAmount));
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const patch = (changes: Partial<TransactionFilter>) => setDraft((d) => ({ ...d, ...changes }));

  const apply = () => {
    setFilter({
      ...draft,
      minAmount: min.trim() ? parseAmount(min, decimals) : null,
      maxAmount: max.trim() ? parseAmount(max, decimals) : null,
    });
    router.back();
  };
  const wrap = { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } as const;
  const parents = lookups.categories.filter((cat) => cat.parentId === null && !cat.archived);

  return (
    <Screen
      header={<Header back title={t('tx.filters')} />}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            label={t('tx.clearFilters')}
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              setFilter({ search: applied.search });
              router.back();
            }}
          />
          <Button label={t('tx.applyFilters')} icon="check" style={{ flex: 1 }} onPress={apply} />
        </View>
      }
    >
      <SectionTitle>{t('filter.type')}</SectionTitle>
      <View style={wrap}>
        {TRANSACTION_TYPES.map((type) => (
          <Chip
            key={type}
            label={t(TYPE_LABEL[type])}
            selected={draft.types?.includes(type)}
            onPress={() => patch({ types: toggle(draft.types, type) })}
          />
        ))}
      </View>

      <SectionTitle>{t('filter.account')}</SectionTitle>
      <View style={wrap}>
        {lookups.accounts.map((account) => (
          <Chip
            key={account.id}
            label={account.name}
            icon={account.icon}
            iconColor={account.color}
            selected={draft.accountIds?.includes(account.id)}
            onPress={() => patch({ accountIds: toggle(draft.accountIds, account.id) })}
          />
        ))}
      </View>

      <SectionTitle>{t('filter.category')}</SectionTitle>
      <View style={wrap}>
        {parents.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            icon={category.icon}
            iconColor={category.color}
            selected={draft.categoryIds?.includes(category.id)}
            onPress={() => patch({ categoryIds: toggle(draft.categoryIds, category.id) })}
          />
        ))}
      </View>

      <SectionTitle>{t('filter.method')}</SectionTitle>
      <View style={wrap}>
        {PAYMENT_METHODS.map((method) => (
          <Chip
            key={method}
            label={t(METHOD_LABEL[method])}
            selected={draft.methods?.includes(method)}
            onPress={() => patch({ methods: toggle(draft.methods, method) })}
          />
        ))}
      </View>

      <SectionTitle>{t('filter.source')}</SectionTitle>
      <View style={wrap}>
        {TRANSACTION_SOURCES.map((source) => (
          <Chip
            key={source}
            label={t(SOURCE_LABEL[source])}
            selected={draft.sources?.includes(source)}
            onPress={() => patch({ sources: toggle(draft.sources, source) })}
          />
        ))}
      </View>

      <SectionTitle>{t('filter.amount')}</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('filter.min')}
            keyboardType="decimal-pad"
            value={min}
            onChangeText={setMin}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('filter.max')}
            keyboardType="decimal-pad"
            value={max}
            onChangeText={setMax}
          />
        </View>
      </View>

      <SectionTitle>{t('filter.dates')}</SectionTitle>
      <View style={wrap}>
        <Chip
          icon="calendar-start"
          label={
            draft.start
              ? t('filter.from', { date: dayLabel(t, draft.start) })
              : t('filter.anyStart')
          }
          selected={Boolean(draft.start)}
          onPress={() => (draft.start ? patch({ start: null }) : setPicking('start'))}
        />
        <Chip
          icon="calendar-end"
          label={
            draft.end ? t('filter.until', { date: dayLabel(t, draft.end) }) : t('filter.anyEnd')
          }
          selected={Boolean(draft.end)}
          onPress={() => (draft.end ? patch({ end: null }) : setPicking('end'))}
        />
        <Chip
          icon="clock-outline"
          label={t('tx.scheduled')}
          selected={draft.status === 'scheduled'}
          onPress={() => patch({ status: draft.status === 'scheduled' ? undefined : 'scheduled' })}
        />
      </View>

      {picking ? (
        <DayPicker
          visible
          value={(picking === 'start' ? draft.start : draft.end) ?? today}
          today={today}
          onSelect={(day) => patch(picking === 'start' ? { start: day } : { end: day })}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </Screen>
  );
}
