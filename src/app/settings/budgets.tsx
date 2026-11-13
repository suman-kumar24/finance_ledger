import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';

import {
  copyLastBudgets,
  createBudget,
  deleteBudget,
  listBudgets,
  previousBudgetPeriod,
  updateBudget,
} from '@/data/budgets';
import { currentPeriodKey, loadPeriodView } from '@/data/queries';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { periodFromKey } from '@/domain/months';
import { useMoney } from '@/hooks/useMoney';
import { useSettings } from '@/hooks/useSettings';
import { useToday } from '@/hooks/useToday';
import { periodLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { BudgetRow } from '@/ui/BudgetRow';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Header,
  IconButton,
  Screen,
  SwitchRow,
  T,
} from '@/ui/kit';
import { MonthSwitcher } from '@/ui/MonthSwitcher';
import { radius, space, useTheme } from '@/ui/theme';

interface Draft {
  id: string | null;
  name: string;
  limit: string;
  recurring: boolean;
  categoryIds: string[];
}

export default function Budgets() {
  const t = useT();
  const c = useTheme();
  const today = useToday();
  const settings = useSettings();
  const { money, currency } = useMoney();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const decimals = currencyInfo(currency).decimals;
  const currentKey = currentPeriodKey(settings, today);
  const [periodKey, setPeriodKey] = useState(currentKey);
  const [draft, setDraft] = useState<Draft | null>(null);
  const data = useLive(
    (db) => ({
      view: loadPeriodView(db, periodKey, settings, today),
      budgets: listBudgets(db, periodKey),
      previous: previousBudgetPeriod(db, periodKey),
    }),
    [periodKey, settings.monthStartDay, settings.budgetWarningPercent, today],
  );
  const { view, budgets, previous } = data;
  const expenseCategories = view.lookups.categories.filter(
    (cat) => cat.kind === 'expense' && cat.parentId === null && !cat.archived,
  );
  const usedElsewhere = new Set(
    budgets.filter((b) => b.id !== draft?.id).flatMap((b) => b.categoryIds),
  );

  const open = (id: string) => {
    const b = budgets.find((item) => item.id === id);
    if (!b) return;
    setDraft({
      id: b.id,
      name: b.name,
      limit: toDecimalString(b.limit, decimals).replace(/\.0+$/, ''),
      recurring: b.recurring,
      categoryIds: b.categoryIds,
    });
  };
  const limitValue = draft ? parseAmount(draft.limit, decimals) : null;
  const valid =
    draft !== null &&
    draft.name.trim() !== '' &&
    limitValue !== null &&
    limitValue > 0 &&
    draft.categoryIds.length > 0;

  const save = () => {
    if (!draft || !valid || limitValue === null) return;
    const input = {
      name: draft.name,
      limit: limitValue,
      recurring: draft.recurring,
      categoryIds: draft.categoryIds,
    };
    if (draft.id) updateBudget(getDb(), draft.id, input);
    else createBudget(getDb(), { ...input, period: periodKey });
    setDraft(null);
  };
  const remove = () => {
    if (!draft?.id) return;
    const id = draft.id;
    Alert.alert(t('budget.deleteTitle', { name: draft.name }), t('budget.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteBudget(getDb(), id);
          setDraft(null);
        },
      },
    ]);
  };

  return (
    <Screen
      header={
        <Header
          back
          title={t('settings.budgets')}
          right={
            <IconButton
              icon="plus"
              label={t('budget.add')}
              onPress={() =>
                setDraft({ id: null, name: '', limit: '', recurring: true, categoryIds: [] })
              }
            />
          }
        />
      }
    >
      <MonthSwitcher
        period={periodFromKey(periodKey, settings.monthStartDay)}
        currentKey={currentKey}
        showRange={settings.monthStartDay !== 1}
        onChange={setPeriodKey}
      />
      {budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon="chart-donut"
            title={t('budget.emptyTitle')}
            body={t('budget.emptyBody')}
            action={
              <View style={{ gap: space.sm }}>
                <Button
                  label={t('budget.add')}
                  icon="plus"
                  onPress={() =>
                    setDraft({ id: null, name: '', limit: '', recurring: true, categoryIds: [] })
                  }
                />
                {previous ? (
                  <Button
                    label={t('budget.copyFrom', { month: periodLabel(t, previous) })}
                    icon="content-copy"
                    variant="secondary"
                    onPress={() => {
                      const n = copyLastBudgets(getDb(), periodKey);
                      showSnackbar(t('budget.copied', { count: n }));
                    }}
                  />
                ) : null}
              </View>
            }
          />
        </Card>
      ) : (
        <>
          <Card padded={false}>
            {view.budgets.map((status) => (
              <Pressable
                key={status.budgetId}
                accessibilityRole="button"
                accessibilityHint={t('budget.editHint')}
                onPress={() => open(status.budgetId)}
                android_ripple={{ color: c.scrim }}
                style={{ padding: space.lg }}
              >
                <BudgetRow status={status} />
              </Pressable>
            ))}
          </Card>
          <T variant="caption" tone="muted" center>
            {t('budget.totalLine', { limit: money(view.totals.limit, { fraction: 'never' }) })}
          </T>
          {previous ? (
            <Button
              label={t('budget.copyFrom', { month: periodLabel(t, previous) })}
              icon="content-copy"
              variant="ghost"
              onPress={() => {
                const n = copyLastBudgets(getDb(), periodKey);
                showSnackbar(n > 0 ? t('budget.copied', { count: n }) : t('budget.nothingToCopy'));
              }}
            />
          ) : null}
        </>
      )}

      <Modal
        visible={draft !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDraft(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: c.scrim }}
          onPress={() => setDraft(null)}
          accessibilityLabel={t('common.close')}
        />
        {draft ? (
          <View
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              marginTop: -radius.lg,
              maxHeight: '88%',
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: space.lg, gap: space.lg }}
            >
              <T variant="heading" accessibilityRole="header">
                {draft.id ? t('budget.edit') : t('budget.add')}
              </T>
              <Field
                label={t('budget.name')}
                placeholder={t('budget.namePlaceholder')}
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                autoCapitalize="words"
              />
              <Field
                label={t('budget.limit', { month: periodLabel(t, periodKey) })}
                keyboardType="decimal-pad"
                value={draft.limit}
                onChangeText={(limit) => setDraft({ ...draft, limit })}
                error={
                  draft.limit.trim() !== '' && (limitValue === null || limitValue <= 0)
                    ? t('common.invalidAmount')
                    : null
                }
              />
              <View style={{ gap: 6 }}>
                <T variant="label" tone="muted">
                  {t('budget.categories')}
                </T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {expenseCategories.map((cat) => {
                    const selected = draft.categoryIds.includes(cat.id);
                    return (
                      <Chip
                        key={cat.id}
                        label={cat.name}
                        icon={cat.icon}
                        iconColor={cat.color}
                        selected={selected}
                        accessibilityLabel={
                          usedElsewhere.has(cat.id)
                            ? `${cat.name}, ${t('budget.inAnother')}`
                            : cat.name
                        }
                        onPress={() =>
                          setDraft({
                            ...draft,
                            categoryIds: selected
                              ? draft.categoryIds.filter((id) => id !== cat.id)
                              : [...draft.categoryIds, cat.id],
                          })
                        }
                      />
                    );
                  })}
                </View>
                {draft.categoryIds.some((id) => usedElsewhere.has(id)) ? (
                  <T variant="caption" tone="warning">
                    {t('budget.overlapNote')}
                  </T>
                ) : null}
              </View>
              <SwitchRow
                title={t('budget.recurring')}
                subtitle={t('budget.recurringSub')}
                value={draft.recurring}
                onChange={(recurring) => setDraft({ ...draft, recurring })}
              />
              <Button label={t('common.save')} icon="check" onPress={save} disabled={!valid} />
              {draft.id ? (
                <Button
                  label={t('budget.delete')}
                  variant="ghost"
                  icon="trash-can-outline"
                  onPress={remove}
                />
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}
