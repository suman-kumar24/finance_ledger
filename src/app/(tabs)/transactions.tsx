import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { loadLookups } from '@/data/queries';
import {
  countTransactions,
  dayExpenseTotals,
  deleteTransaction,
  isFilterActive,
  listTransactions,
  restoreTransaction,
} from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { addDays, type Day } from '@/domain/dates';
import type { Transaction } from '@/domain/types';
import { TransactionRow } from '@/features/TransactionRow';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { friendlyDay, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { Fab } from '@/ui/Fab';
import { Button, Chip, EmptyState, Header, Icon, IconButton, T } from '@/ui/kit';
import { radius, space, TOUCH, useTheme } from '@/ui/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PAGE = 60;

type Item =
  | { kind: 'header'; key: string; day: Day; total: number }
  | { kind: 'row'; key: string; tx: Transaction };

function SwipeAction({
  icon,
  label,
  color,
  background,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 88,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <Icon name={icon} color={color} />
      <T variant="caption" style={{ color, fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  );
}

export default function Transactions() {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { money } = useMoney();
  const today = useToday();
  const yesterday = addDays(today, -1);
  const filter = useUi((s) => s.filter);
  const setFilter = useUi((s) => s.setFilter);
  const showSnackbar = useUi((s) => s.showSnackbar);
  const [search, setSearch] = useState(filter.search ?? '');

  // Debounce typing so each keystroke does not re-query.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filter.search ?? '') !== search) setFilter({ ...filter, search });
    }, 220);
    return () => clearTimeout(timer);
  }, [search, filter, setFilter]);

  const filterKey = JSON.stringify(filter);
  // Paging restarts whenever the filter changes.
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE });
  const limit = paging.key === filterKey ? paging.limit : PAGE;

  const lookups = useLive(loadLookups);
  const rows = useLive(
    (db) => listTransactions(db, filter, { limit, offset: 0 }),
    [filterKey, limit],
  );
  const total = useLive((db) => countTransactions(db, filter), [filterKey]);
  const lastDay = rows[rows.length - 1]?.day;
  const totals = useLive(
    (db) => (lastDay ? dayExpenseTotals(db, filter, lastDay) : new Map<Day, number>()),
    [filterKey, lastDay],
  );

  const items = useMemo(() => {
    const out: Item[] = [];
    let day: Day | null = null;
    for (const tx of rows) {
      if (tx.day !== day) {
        day = tx.day;
        out.push({ kind: 'header', key: `h-${day}`, day, total: totals.get(day) ?? 0 });
      }
      out.push({ kind: 'row', key: tx.id, tx });
    }
    return out;
  }, [rows, totals]);

  const edit = useCallback((tx: Transaction) => {
    router.push({ pathname: '/quick-add', params: { id: tx.id } });
  }, []);

  const remove = useCallback(
    (tx: Transaction) => {
      const removed = deleteTransaction(getDb(), tx.id);
      if (!removed) return;
      showSnackbar(t('tx.deleted'), t('common.undo'), () => restoreTransaction(getDb(), removed));
    },
    [showSnackbar, t],
  );

  const menu = useCallback(
    (tx: Transaction) => {
      Alert.alert(t('tx.actions'), undefined, [
        { text: t('common.edit'), onPress: () => edit(tx) },
        { text: t('common.delete'), style: 'destructive', onPress: () => remove(tx) },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    },
    [edit, remove, t],
  );

  const active = isFilterActive({ ...filter, search: undefined });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm }}>
        <Header
          title={t('tab.transactions')}
          subtitle={t('tx.count', { count: total })}
          right={
            <IconButton
              icon={active ? 'filter-check' : 'filter-variant'}
              label={active ? t('tx.filtersActive') : t('tx.filters')}
              color={active ? c.accent : c.text}
              onPress={() => router.push('/filters')}
            />
          }
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.surface,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: c.border,
            paddingLeft: space.md,
            minHeight: TOUCH,
          }}
        >
          <Icon name="magnify" color={c.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('tx.searchPlaceholder')}
            placeholderTextColor={c.textMuted}
            accessibilityLabel={t('tx.search')}
            returnKeyType="search"
            style={{
              flex: 1,
              color: c.text,
              fontSize: 16,
              paddingHorizontal: space.sm,
              minHeight: TOUCH,
            }}
          />
          {search ? (
            <IconButton
              icon="close-circle"
              label={t('tx.clearSearch')}
              onPress={() => setSearch('')}
            />
          ) : null}
        </View>
        {active ? (
          <View style={{ flexDirection: 'row' }}>
            <Chip
              icon="filter-remove-outline"
              label={t('tx.clearFilters')}
              onPress={() => setFilter({ search: filter.search })}
            />
          </View>
        ) : null}
      </View>

      <FlashList
        data={items}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (rows.length >= limit && rows.length < total)
            setPaging({ key: filterKey, limit: limit + PAGE });
        }}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          <EmptyState
            icon={active || search ? 'text-search' : 'receipt-text-outline'}
            title={active || search ? t('tx.noMatches') : t('tx.emptyTitle')}
            body={active || search ? t('tx.noMatchesBody') : t('tx.emptyBody')}
            action={
              active || search ? (
                <Button
                  label={t('tx.clearFilters')}
                  variant="secondary"
                  onPress={() => {
                    setSearch('');
                    setFilter({});
                  }}
                />
              ) : (
                <Button
                  label={t('quick.add')}
                  icon="plus"
                  onPress={() => router.push('/quick-add')}
                />
              )
            }
          />
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <View
                accessible
                accessibilityRole="header"
                accessibilityLabel={
                  item.total > 0
                    ? t('tx.dayHeaderA11y', {
                        day: friendlyDay(t, item.day, today, yesterday),
                        amount: money(item.total),
                      })
                    : friendlyDay(t, item.day, today, yesterday)
                }
                style={{
                  flexDirection: 'row',
                  paddingHorizontal: space.lg,
                  paddingTop: space.lg,
                  paddingBottom: space.xs,
                }}
              >
                <T variant="label" tone="muted" style={{ flex: 1 }}>
                  {friendlyDay(t, item.day, today, yesterday)}
                </T>
                {item.total > 0 ? (
                  <T variant="label" tone="muted" numeric>
                    −{money(item.total, { sign: 'never' })}
                  </T>
                ) : null}
              </View>
            );
          }
          return (
            <Swipeable
              friction={1.6}
              overshootLeft={false}
              overshootRight={false}
              renderLeftActions={(_p, _t, methods) => (
                <SwipeAction
                  icon="pencil-outline"
                  label={t('common.edit')}
                  color={c.onAccent}
                  background={c.accent}
                  onPress={() => {
                    methods.close();
                    edit(item.tx);
                  }}
                />
              )}
              renderRightActions={(_p, _t, methods) => (
                <SwipeAction
                  icon="trash-can-outline"
                  label={t('common.delete')}
                  color={c.dark ? '#2B0B09' : '#FFFFFF'}
                  background={c.danger}
                  onPress={() => {
                    methods.close();
                    remove(item.tx);
                  }}
                />
              )}
            >
              <TransactionRow
                tx={item.tx}
                lookups={lookups}
                onPress={edit}
                onLongPress={menu}
                onDelete={remove}
              />
            </Swipeable>
          );
        }}
      />
      <Fab />
    </View>
  );
}
