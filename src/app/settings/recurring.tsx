import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';

import { loadLookups } from '@/data/queries';
import {
  createRecurringRule,
  deleteRecurringRule,
  listRecurringRules,
  setRecurringActive,
  updateRecurringRule,
  type RecurringInput,
} from '@/data/recurring';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import type { Day } from '@/domain/dates';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { monthlyEquivalent } from '@/domain/recurring';
import {
  FREQUENCIES,
  type Frequency,
  type PaymentMethod,
  type RecurringMode,
  type RecurringRule,
} from '@/domain/types';
import { defaultMethod } from '@/features/useEntryForm';
import { TYPE_ICON, TYPE_LABEL } from '@/features/txDisplay';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT, type StringKey } from '@/i18n';
import { syncNotifications } from '@/notify';
import { DayPicker } from '@/ui/DayPicker';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  Header,
  Icon,
  IconButton,
  Pill,
  Screen,
  Segmented,
  T,
} from '@/ui/kit';
import { accountOptions, CategorySheet, OptionSheet } from '@/ui/Pickers';
import { radius, space, useTheme } from '@/ui/theme';

const FREQUENCY_LABEL: Record<Frequency, StringKey> = {
  daily: 'recurring.daily',
  weekly: 'recurring.weekly',
  monthly: 'recurring.monthly',
  quarterly: 'recurring.quarterly',
  yearly: 'recurring.yearly',
};
const RULE_TYPES: RecurringRule['type'][] = ['expense', 'income', 'transfer', 'card_payment'];

interface Draft {
  id: string | null;
  name: string;
  type: RecurringRule['type'];
  amount: string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  method: PaymentMethod | null;
  frequency: Frequency;
  nextDate: Day;
  endDate: Day | null;
  mode: RecurringMode;
}

export default function Recurring() {
  const t = useT();
  const c = useTheme();
  const today = useToday();
  const { money, currency } = useMoney();
  const decimals = currencyInfo(currency).decimals;
  const data = useLive((db) => ({ rules: listRecurringRules(db), lookups: loadLookups(db) }));
  const { rules, lookups } = data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheet, setSheet] = useState<'account' | 'to' | 'category' | 'next' | 'end' | null>(null);
  const accounts = lookups.accounts.filter((a) => !a.archived);

  const blank = (): Draft => {
    const first = accounts.find((a) => a.type === 'bank') ?? accounts[0];
    return {
      id: null,
      name: '',
      type: 'expense',
      amount: '',
      accountId: first?.id ?? null,
      toAccountId: null,
      categoryId: null,
      method: defaultMethod(first),
      frequency: 'monthly',
      nextDate: today,
      endDate: null,
      mode: 'remind',
    };
  };
  const edit = (rule: RecurringRule) =>
    setDraft({
      id: rule.id,
      name: rule.name,
      type: rule.type,
      amount: toDecimalString(rule.amount, decimals).replace(/\.0+$/, ''),
      accountId: rule.accountId,
      toAccountId: rule.toAccountId,
      categoryId: rule.categoryId,
      method: rule.method,
      frequency: rule.frequency,
      nextDate: rule.nextDate,
      endDate: rule.endDate,
      mode: rule.mode,
    });

  const moves = draft?.type === 'transfer' || draft?.type === 'card_payment';
  const amountValue = draft ? parseAmount(draft.amount, decimals) : null;
  const valid =
    draft !== null &&
    draft.name.trim() !== '' &&
    amountValue !== null &&
    amountValue > 0 &&
    draft.accountId !== null &&
    (!moves || (draft.toAccountId !== null && draft.toAccountId !== draft.accountId));

  const save = () => {
    if (!draft || !valid || amountValue === null || draft.accountId === null) return;
    const input: RecurringInput = {
      name: draft.name,
      type: draft.type,
      amount: amountValue,
      accountId: draft.accountId,
      toAccountId: draft.toAccountId,
      categoryId: draft.categoryId,
      method: draft.method,
      frequency: draft.frequency,
      interval: 1,
      nextDate: draft.nextDate,
      endDate: draft.endDate,
      mode: draft.mode,
      note: null,
    };
    if (draft.id) updateRecurringRule(getDb(), draft.id, input);
    else createRecurringRule(getDb(), input);
    setDraft(null);
    void syncNotifications(getDb());
  };

  const remove = () => {
    if (!draft?.id) return;
    const id = draft.id;
    Alert.alert(t('recurring.deleteTitle', { name: draft.name }), t('recurring.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteRecurringRule(getDb(), id);
          setDraft(null);
          void syncNotifications(getDb());
        },
      },
    ]);
  };

  const monthly = rules
    .filter((r) => r.active && (r.type === 'expense' || r.type === 'transfer'))
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0);
  const account = draft?.accountId ? lookups.accountById.get(draft.accountId) : undefined;
  const toAccount = draft?.toAccountId ? lookups.accountById.get(draft.toAccountId) : undefined;
  const category = draft?.categoryId ? lookups.categoryById.get(draft.categoryId) : undefined;
  const toChoices = accounts.filter(
    (a) =>
      a.id !== draft?.accountId &&
      (draft?.type === 'card_payment' ? a.type === 'credit_card' : true),
  );
  const fromChoices = accounts.filter((a) =>
    draft?.type === 'card_payment' ? a.type !== 'credit_card' : true,
  );

  return (
    <Screen
      header={
        <Header
          back
          title={t('settings.recurring')}
          right={
            <IconButton icon="plus" label={t('recurring.add')} onPress={() => setDraft(blank())} />
          }
        />
      }
    >
      {rules.length === 0 ? (
        <Card>
          <EmptyState
            icon="repeat"
            title={t('recurring.emptyTitle')}
            body={t('recurring.emptyBody')}
            action={
              <Button label={t('recurring.add')} icon="plus" onPress={() => setDraft(blank())} />
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <T variant="label" tone="muted">
              {t('recurring.monthlyTotal')}
            </T>
            <T variant="title" numeric>
              {money(monthly, { fraction: 'never' })}
            </T>
          </Card>
          <Card padded={false}>
            {rules.map((rule, index) => (
              <View key={rule.id}>
                {index > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${rule.name}, ${money(rule.amount)}, ${t(FREQUENCY_LABEL[rule.frequency])}, ${t('recurring.nextOn', { date: dayLabel(t, rule.nextDate, today) })}`}
                    accessibilityHint={t('recurring.editHint')}
                    onPress={() => edit(rule)}
                    android_ripple={{ color: c.scrim }}
                    style={{
                      flex: 1,
                      minHeight: 68,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingLeft: space.lg,
                      paddingVertical: space.sm,
                      opacity: rule.active ? 1 : 0.55,
                    }}
                  >
                    <Icon name={TYPE_ICON[rule.type]} color={c.accent} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T style={{ fontWeight: '500' }} numberOfLines={1}>
                        {rule.name}
                      </T>
                      <T variant="caption" tone="muted">
                        {t(FREQUENCY_LABEL[rule.frequency])} ·{' '}
                        {t('recurring.nextOn', { date: dayLabel(t, rule.nextDate, today) })}
                      </T>
                      {rule.active ? (
                        <Pill
                          tone={rule.mode === 'auto' ? 'accent' : 'neutral'}
                          icon={rule.mode === 'auto' ? 'auto-fix' : 'bell-outline'}
                          label={
                            rule.mode === 'auto'
                              ? t('recurring.modeAuto')
                              : t('recurring.modeRemind')
                          }
                        />
                      ) : (
                        <Pill icon="pause-circle-outline" label={t('recurring.paused')} />
                      )}
                    </View>
                    <T numeric style={{ fontWeight: '600' }}>
                      {money(rule.amount)}
                    </T>
                  </Pressable>
                  <IconButton
                    icon={rule.active ? 'pause' : 'play'}
                    label={
                      rule.active
                        ? t('recurring.pause', { name: rule.name })
                        : t('recurring.resume', { name: rule.name })
                    }
                    color={c.textMuted}
                    onPress={() => {
                      setRecurringActive(getDb(), rule.id, !rule.active);
                      void syncNotifications(getDb());
                    }}
                  />
                </View>
              </View>
            ))}
          </Card>
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
              maxHeight: '90%',
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: space.lg, gap: space.lg }}
            >
              <T variant="heading" accessibilityRole="header">
                {draft.id ? t('recurring.edit') : t('recurring.add')}
              </T>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.sm }}
              >
                {RULE_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={t(TYPE_LABEL[type])}
                    icon={TYPE_ICON[type]}
                    selected={draft.type === type}
                    onPress={() =>
                      setDraft({ ...draft, type, toAccountId: null, categoryId: null })
                    }
                  />
                ))}
              </ScrollView>
              <Field
                label={t('recurring.name')}
                placeholder={t('recurring.namePlaceholder')}
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                autoCapitalize="words"
              />
              <Field
                label={t('recurring.amount')}
                keyboardType="decimal-pad"
                value={draft.amount}
                onChangeText={(amount) => setDraft({ ...draft, amount })}
                error={
                  draft.amount.trim() !== '' && (amountValue === null || amountValue <= 0)
                    ? t('common.invalidAmount')
                    : null
                }
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Chip
                  icon={account?.icon ?? 'bank-outline'}
                  iconColor={account?.color}
                  label={account?.name ?? t('quick.chooseAccount')}
                  highlight={!account}
                  accessibilityLabel={`${t('quick.account')}: ${account?.name ?? t('common.none')}`}
                  onPress={() => setSheet('account')}
                />
                {moves ? (
                  <Chip
                    icon={toAccount?.icon ?? 'arrow-right'}
                    iconColor={toAccount?.color}
                    label={toAccount ? `→ ${toAccount.name}` : t('quick.chooseTo')}
                    highlight={!toAccount}
                    accessibilityLabel={`${t('quick.to')}: ${toAccount?.name ?? t('common.none')}`}
                    onPress={() => setSheet('to')}
                  />
                ) : (
                  <Chip
                    icon={category?.icon ?? 'tag-outline'}
                    iconColor={category?.color}
                    label={category?.name ?? t('quick.category')}
                    accessibilityLabel={`${t('quick.category')}: ${category?.name ?? t('common.none')}`}
                    onPress={() => setSheet('category')}
                  />
                )}
              </View>
              <View style={{ gap: 6 }}>
                <T variant="label" tone="muted">
                  {t('recurring.frequency')}
                </T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {FREQUENCIES.map((frequency) => (
                    <Chip
                      key={frequency}
                      label={t(FREQUENCY_LABEL[frequency])}
                      selected={draft.frequency === frequency}
                      onPress={() => setDraft({ ...draft, frequency })}
                    />
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Chip
                  icon="calendar-outline"
                  label={t('recurring.nextOn', { date: dayLabel(t, draft.nextDate, today) })}
                  onPress={() => setSheet('next')}
                />
                <Chip
                  icon="calendar-end"
                  label={
                    draft.endDate
                      ? t('recurring.endsOn', { date: dayLabel(t, draft.endDate, today) })
                      : t('recurring.noEnd')
                  }
                  selected={draft.endDate !== null}
                  onPress={() =>
                    draft.endDate ? setDraft({ ...draft, endDate: null }) : setSheet('end')
                  }
                />
              </View>
              <View style={{ gap: 6 }}>
                <Segmented<RecurringMode>
                  label={t('recurring.mode')}
                  value={draft.mode}
                  onChange={(mode) => setDraft({ ...draft, mode })}
                  options={[
                    { value: 'remind', label: t('recurring.modeRemind'), icon: 'bell-outline' },
                    { value: 'auto', label: t('recurring.modeAuto'), icon: 'auto-fix' },
                  ]}
                />
                <T variant="caption" tone="muted">
                  {draft.mode === 'auto'
                    ? t('recurring.autoExplain')
                    : t('recurring.remindExplain')}
                </T>
              </View>
              <Button label={t('common.save')} icon="check" onPress={save} disabled={!valid} />
              {draft.id ? (
                <Button
                  label={t('common.delete')}
                  variant="ghost"
                  icon="trash-can-outline"
                  onPress={remove}
                />
              ) : null}
            </ScrollView>
            <OptionSheet<string>
              visible={sheet === 'account'}
              title={t('quick.account')}
              options={accountOptions(fromChoices)}
              value={draft.accountId ?? undefined}
              onClose={() => setSheet(null)}
              onSelect={(accountId) =>
                setDraft({
                  ...draft,
                  accountId,
                  method: defaultMethod(lookups.accountById.get(accountId)),
                })
              }
            />
            <OptionSheet<string>
              visible={sheet === 'to'}
              title={t('quick.to')}
              options={accountOptions(toChoices)}
              value={draft.toAccountId ?? undefined}
              onClose={() => setSheet(null)}
              onSelect={(toAccountId) => setDraft({ ...draft, toAccountId })}
            />
            <CategorySheet
              visible={sheet === 'category'}
              title={t('quick.category')}
              categories={lookups.categories.filter(
                (cat) =>
                  !cat.archived && cat.kind === (draft.type === 'income' ? 'income' : 'expense'),
              )}
              value={draft.categoryId}
              allowNone
              onClose={() => setSheet(null)}
              onSelect={(categoryId) => setDraft({ ...draft, categoryId })}
            />
            {sheet === 'next' || sheet === 'end' ? (
              <DayPicker
                visible
                value={sheet === 'next' ? draft.nextDate : (draft.endDate ?? draft.nextDate)}
                today={today}
                onClose={() => setSheet(null)}
                onSelect={(day) =>
                  setDraft(
                    sheet === 'next' ? { ...draft, nextDate: day } : { ...draft, endDate: day },
                  )
                }
              />
            ) : null}
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}
