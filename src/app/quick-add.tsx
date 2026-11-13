import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadLookups } from '@/data/queries';
import { getTransaction, mostUsedCategoryIds } from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { addDays } from '@/domain/dates';
import { currencyInfo, groupDigits } from '@/domain/money';
import type { PaymentMethod, TransactionType } from '@/domain/types';
import { PAYMENT_METHODS } from '@/domain/types';
import { afterEntrySaved } from '@/features/afterSave';
import { QuickText } from '@/features/QuickText';
import { METHOD_ICON, METHOD_LABEL, TYPE_ICON, TYPE_LABEL } from '@/features/txDisplay';
import {
  defaultMethod,
  emptyForm,
  formFromTransaction,
  pickDefaultAccount,
  useEntryForm,
  type EntryForm,
} from '@/features/useEntryForm';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { friendlyDay, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { AmountPad } from '@/ui/AmountPad';
import { DayPicker } from '@/ui/DayPicker';
import { Button, Chip, EmptyState, Field, IconButton, Pill, T } from '@/ui/kit';
import { accountOptions, CategorySheet, OptionSheet } from '@/ui/Pickers';
import { radius, space, useTheme } from '@/ui/theme';

const QUICK_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'refund', 'card_payment'];

export type UncertainField = 'amount' | 'category' | 'account' | 'date' | 'type' | 'method';

export default function QuickAdd() {
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const { currency, grouping, money } = useMoney();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const lookups = useLive(loadLookups);
  const editing = useMemo(
    () => (params.id ? getTransaction(getDb(), params.id) : null),
    [params.id],
  );
  const info = currencyInfo(currency);

  const initial = useMemo<EntryForm>(() => {
    if (editing) return formFromTransaction(editing, info.decimals);
    const type = QUICK_TYPES.includes(params.type as TransactionType)
      ? (params.type as TransactionType)
      : 'expense';
    return emptyForm(lookups, today, type);
    // The form is initialised once per opening of the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const { form, patch, input, save } = useEntryForm(initial, currency, today);

  const [sheet, setSheet] = useState<'account' | 'to' | 'category' | 'method' | 'date' | null>(
    null,
  );
  const [details, setDetails] = useState(
    Boolean(editing && (editing.payee || editing.note || editing.tags.length)),
  );
  const [typing, setTyping] = useState(false);
  const [uncertain, setUncertain] = useState<Set<UncertainField>>(new Set());
  const confirm = (field: UncertainField) =>
    setUncertain((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });

  const activeAccounts = lookups.accounts.filter(
    (a) => !a.archived || a.id === form.accountId || a.id === form.toAccountId,
  );
  const moves = form.type === 'transfer' || form.type === 'card_payment';
  const categoryKind = form.type === 'income' ? 'income' : 'expense';
  const recent = useLive(
    (db) =>
      mostUsedCategoryIds(db, addDays(today, -90), form.type === 'income' ? 'income' : 'expense'),
    [today, form.type],
  );
  const categories = useMemo(() => {
    const usable = lookups.categories.filter(
      (cat) =>
        (!cat.archived || cat.id === form.categoryId) &&
        (form.type === 'adjustment' || cat.kind === categoryKind),
    );
    const rank = new Map(recent.map((id, index) => [id, index]));
    return [...usable].sort(
      (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.sortOrder - b.sortOrder,
    );
  }, [lookups.categories, recent, categoryKind, form.type, form.categoryId]);

  const account = form.accountId ? lookups.accountById.get(form.accountId) : undefined;
  const toAccount = form.toAccountId ? lookups.accountById.get(form.toAccountId) : undefined;
  const fromChoices = activeAccounts.filter((a) =>
    form.type === 'card_payment' ? a.type !== 'credit_card' : true,
  );
  const toChoices = activeAccounts.filter(
    (a) =>
      a.id !== form.accountId && (form.type === 'card_payment' ? a.type === 'credit_card' : true),
  );

  const setType = (type: TransactionType) => {
    confirm('type');
    const accountId = form.accountId ?? pickDefaultAccount(lookups, type);
    const current = accountId ? lookups.accountById.get(accountId) : undefined;
    const next: Partial<EntryForm> = { type };
    if (type === 'card_payment') {
      if (current?.type === 'credit_card') {
        next.accountId = lookups.accounts.find((a) => !a.archived && a.type === 'bank')?.id ?? null;
      }
      const cards = lookups.accounts.filter((a) => !a.archived && a.type === 'credit_card');
      if (!toAccount || toAccount.type !== 'credit_card')
        next.toAccountId = cards.length === 1 ? (cards[0]?.id ?? null) : null;
    }
    const wantKind = type === 'income' ? 'income' : 'expense';
    const currentCategory = form.categoryId ? lookups.categoryById.get(form.categoryId) : undefined;
    if (currentCategory && currentCategory.kind !== wantKind && type !== 'adjustment')
      next.categoryId = null;
    patch(next);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const onSave = () => {
    try {
      const saved = save(editing?.id);
      if (!saved) return;
      afterEntrySaved(saved, form.payee);
      showSnackbar(
        saved.status === 'scheduled'
          ? t('quick.savedScheduled')
          : editing
            ? t('quick.updated')
            : t('quick.saved'),
      );
      close();
    } catch {
      showSnackbar(t('quick.saveFailed'));
    }
  };

  const [whole = '', fraction] = form.amountText.split('.');
  const amountShown =
    form.amountText === ''
      ? '0'
      : `${groupDigits(whole, grouping)}${fraction !== undefined ? `.${fraction}` : ''}`;
  const beforeOpening = account && form.day < account.openingDate;
  const yesterday = addDays(today, -1);

  if (lookups.accounts.filter((a) => !a.archived).length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingBottom: insets.bottom + space.lg,
          }}
        >
          <EmptyState
            icon="bank-plus"
            title={t('quick.needAccountTitle')}
            body={t('quick.needAccountBody')}
            action={
              <View style={{ gap: space.sm }}>
                <Button
                  label={t('account.add')}
                  icon="plus"
                  onPress={() => router.replace('/account-edit')}
                />
                <Button label={t('common.cancel')} variant="ghost" onPress={close} />
              </View>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable
        style={{ flex: 1, backgroundColor: c.scrim }}
        onPress={close}
        accessibilityLabel={t('common.close')}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: c.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          marginTop: -radius.lg,
          paddingBottom: insets.bottom + space.sm,
          maxHeight: '94%',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: space.lg,
            paddingRight: space.xs,
          }}
        >
          <T variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
            {editing ? t('quick.editTitle') : t('quick.title')}
          </T>
          <IconButton icon="close" label={t('common.close')} onPress={close} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: space.md, paddingBottom: space.sm }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('quick.type')}
          >
            {(form.type === 'adjustment' ? (['adjustment'] as TransactionType[]) : QUICK_TYPES).map(
              (type) => (
                <Chip
                  key={type}
                  label={t(TYPE_LABEL[type])}
                  icon={TYPE_ICON[type]}
                  selected={form.type === type}
                  highlight={form.type === type && uncertain.has('type')}
                  onPress={() => setType(type)}
                />
              ),
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quick.amountA11y', {
              amount: input ? money(Math.abs(input.amount)) : amountShown,
            })}
            accessibilityHint={t('quick.amountHint')}
            onPress={() => {
              Keyboard.dismiss();
              setTyping(false);
              confirm('amount');
            }}
            style={{
              marginHorizontal: space.lg,
              borderRadius: radius.md,
              borderWidth: uncertain.has('amount') ? 2 : 0,
              borderStyle: 'dashed',
              borderColor: c.warning,
              backgroundColor: uncertain.has('amount') ? c.warningSoft : 'transparent',
              paddingVertical: space.xs,
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
              <T variant="title" tone="muted" style={{ marginBottom: 6 }}>
                {form.type === 'adjustment' && form.negative ? '−' : ''}
                {info.symbol.trim()}
              </T>
              <T
                variant="display"
                numeric
                numberOfLines={1}
                adjustsFontSizeToFit
                tone={form.amountText === '' ? 'muted' : 'default'}
                style={{ fontSize: 48, lineHeight: 56 }}
              >
                {amountShown}
              </T>
            </View>
            {uncertain.has('amount') ? (
              <T variant="caption" tone="warning">
                {t('quick.checkThis')}
              </T>
            ) : null}
          </Pressable>

          {!editing ? (
            <QuickText
              lookups={lookups}
              today={today}
              onFocusChange={setTyping}
              onParsed={(changes, doubtful) => {
                patch(changes);
                setUncertain(new Set(doubtful));
                if (changes.payee || changes.note) setDetails(true);
              }}
            />
          ) : null}

          {form.type === 'adjustment' ? (
            <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg }}>
              <Chip
                label={t('quick.lowersBalance')}
                icon="minus-circle-outline"
                selected={form.negative}
                onPress={() => patch({ negative: true })}
              />
              <Chip
                label={t('quick.raisesBalance')}
                icon="plus-circle-outline"
                selected={!form.negative}
                onPress={() => patch({ negative: false })}
              />
            </View>
          ) : null}

          {!moves ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
              accessibilityLabel={t('quick.category')}
            >
              {categories.slice(0, 9).map((cat) => (
                <Chip
                  key={cat.id}
                  label={cat.name}
                  icon={cat.icon}
                  iconColor={cat.color}
                  selected={form.categoryId === cat.id}
                  highlight={form.categoryId === cat.id && uncertain.has('category')}
                  onPress={() => {
                    confirm('category');
                    patch({ categoryId: form.categoryId === cat.id ? null : cat.id });
                  }}
                />
              ))}
              <Chip
                label={t('quick.allCategories')}
                icon="dots-grid"
                highlight={form.categoryId === null && uncertain.has('category')}
                onPress={() => setSheet('category')}
              />
            </ScrollView>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.sm,
              paddingHorizontal: space.lg,
            }}
          >
            <Chip
              label={account ? account.name : t('quick.chooseAccount')}
              icon={account?.icon ?? 'bank-outline'}
              iconColor={account?.color}
              highlight={uncertain.has('account') || !account}
              accessibilityLabel={`${moves ? t('quick.from') : t('quick.account')}: ${account?.name ?? t('common.none')}`}
              onPress={() => setSheet('account')}
            />
            {moves ? (
              <Chip
                label={toAccount ? `→ ${toAccount.name}` : t('quick.chooseTo')}
                icon={toAccount?.icon ?? 'arrow-right'}
                iconColor={toAccount?.color}
                highlight={!toAccount}
                accessibilityLabel={`${t('quick.to')}: ${toAccount?.name ?? t('common.none')}`}
                onPress={() => setSheet('to')}
              />
            ) : (
              <Chip
                label={form.method ? t(METHOD_LABEL[form.method]) : t('quick.method')}
                icon={form.method ? METHOD_ICON[form.method] : 'contactless-payment'}
                highlight={uncertain.has('method')}
                accessibilityLabel={`${t('quick.method')}: ${form.method ? t(METHOD_LABEL[form.method]) : t('common.none')}`}
                onPress={() => setSheet('method')}
              />
            )}
            <Chip
              label={friendlyDay(t, form.day, today, yesterday)}
              icon="calendar-outline"
              highlight={uncertain.has('date')}
              accessibilityLabel={`${t('quick.date')}: ${friendlyDay(t, form.day, today, yesterday)}`}
              onPress={() => setSheet('date')}
            />
            <Chip
              label={details ? t('quick.lessDetails') : t('quick.moreDetails')}
              icon={details ? 'chevron-up' : 'text-box-plus-outline'}
              onPress={() => setDetails((v) => !v)}
            />
          </View>

          {form.day > today ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <Pill tone="accent" icon="clock-outline" label={t('quick.willBeScheduled')} />
            </View>
          ) : beforeOpening ? (
            <T variant="caption" tone="muted" style={{ paddingHorizontal: space.lg }}>
              {t('quick.beforeOpening', { name: account.name })}
            </T>
          ) : null}

          {details ? (
            <View style={{ gap: space.md, paddingHorizontal: space.lg }}>
              <Field
                label={
                  form.type === 'income' || form.type === 'refund'
                    ? t('quick.payer')
                    : t('quick.payee')
                }
                value={form.payee}
                onChangeText={(payee) => patch({ payee })}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                autoCapitalize="words"
              />
              <Field
                label={t('quick.note')}
                value={form.note}
                onChangeText={(note) => patch({ note })}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
              />
              <Field
                label={t('quick.tags')}
                hint={t('quick.tagsHint')}
                value={form.tags}
                onChangeText={(tags) => patch({ tags })}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                autoCapitalize="none"
              />
            </View>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: space.md, gap: space.sm, paddingTop: space.xs }}>
          {!typing ? (
            <AmountPad
              value={form.amountText}
              decimals={info.decimals}
              onChange={(amountText) => {
                confirm('amount');
                patch({ amountText });
              }}
            />
          ) : null}
          <Button
            label={editing ? t('common.save') : t('quick.save')}
            icon="check"
            onPress={onSave}
            disabled={!input}
            style={{ marginHorizontal: space.xs }}
          />
        </View>
      </View>

      <OptionSheet<string>
        visible={sheet === 'account'}
        title={moves ? t('quick.from') : t('quick.account')}
        options={accountOptions(fromChoices)}
        value={form.accountId ?? undefined}
        onClose={() => setSheet(null)}
        onSelect={(accountId) => {
          confirm('account');
          const chosen = lookups.accountById.get(accountId);
          patch({
            accountId,
            method: moves ? form.method : defaultMethod(chosen),
            toAccountId: form.toAccountId === accountId ? null : form.toAccountId,
          });
        }}
      />
      <OptionSheet<string>
        visible={sheet === 'to'}
        title={t('quick.to')}
        options={accountOptions(toChoices)}
        value={form.toAccountId ?? undefined}
        onClose={() => setSheet(null)}
        onSelect={(toAccountId) => patch({ toAccountId })}
      />
      <OptionSheet<PaymentMethod>
        visible={sheet === 'method'}
        title={t('quick.method')}
        options={PAYMENT_METHODS.map((m) => ({
          value: m,
          label: t(METHOD_LABEL[m]),
          icon: METHOD_ICON[m],
        }))}
        value={form.method ?? undefined}
        onClose={() => setSheet(null)}
        onSelect={(method) => {
          confirm('method');
          patch({ method });
        }}
      />
      <CategorySheet
        visible={sheet === 'category'}
        title={t('quick.category')}
        categories={categories}
        value={form.categoryId}
        allowNone
        onClose={() => setSheet(null)}
        onSelect={(categoryId) => {
          confirm('category');
          patch({ categoryId });
        }}
      />
      {sheet === 'date' ? (
        <DayPicker
          visible
          value={form.day}
          today={today}
          onClose={() => setSheet(null)}
          onSelect={(day) => {
            confirm('date');
            patch({ day });
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
