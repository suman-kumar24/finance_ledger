import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import {
  buyPurchase,
  createPurchase,
  deletePurchase,
  getPurchase,
  updatePurchase,
} from '@/data/plans';
import { loadLookups } from '@/data/queries';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { PRIORITIES, type Priority, type PurchaseStatus } from '@/domain/types';
import { afterEntrySaved } from '@/features/afterSave';
import { PRIORITY_LABEL, PURCHASE_STATUS } from '@/features/planLabels';
import { defaultMethod } from '@/features/useEntryForm';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { DayPicker } from '@/ui/DayPicker';
import {
  Button,
  Card,
  Chip,
  Field,
  Header,
  Pill,
  Screen,
  SectionTitle,
  Segmented,
  T,
} from '@/ui/kit';
import { accountOptions, CategorySheet, OptionSheet } from '@/ui/Pickers';
import { space } from '@/ui/theme';

export default function PurchaseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useT();
  const today = useToday();
  const { currency } = useMoney();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const decimals = currencyInfo(currency).decimals;
  const existing = useMemo(() => (id ? getPurchase(getDb(), id) : null), [id]);
  const lookups = useLive(loadLookups);
  const text = (value: number) => toDecimalString(value, decimals).replace(/\.0+$/, '');

  const [name, setName] = useState(existing?.name ?? '');
  const [price, setPrice] = useState(existing ? text(existing.estimatedPrice) : '');
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [status, setStatus] = useState<PurchaseStatus>(existing?.status ?? 'thinking');
  const [notes, setNotes] = useState(existing?.fundingNotes ?? '');

  const accounts = lookups.accounts.filter((a) => !a.archived && a.type !== 'investment');
  const [paid, setPaid] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [day, setDay] = useState(today);
  const [sheet, setSheet] = useState<'account' | 'category' | 'day' | null>(null);

  const priceValue = parseAmount(price, decimals);
  const valid = name.trim() !== '' && priceValue !== null && priceValue > 0;
  const bought = existing?.status === 'bought';
  const paidText = paid ?? price;
  const paidValue = parseAmount(paidText, decimals);
  const account = accountId ? lookups.accountById.get(accountId) : undefined;
  const category = categoryId ? lookups.categoryById.get(categoryId) : undefined;

  const save = () => {
    if (!valid || priceValue === null) return;
    const input = { name, estimatedPrice: priceValue, priority, fundingNotes: notes, status };
    if (existing) updatePurchase(getDb(), existing.id, input);
    else createPurchase(getDb(), input);
    showSnackbar(t('purchase.saved'));
    router.back();
  };

  const buy = () => {
    if (!existing || !account || paidValue === null || paidValue <= 0) return;
    updatePurchase(getDb(), existing.id, { name, priority, fundingNotes: notes });
    const tx = buyPurchase(getDb(), existing.id, {
      amount: paidValue,
      day,
      accountId: account.id,
      categoryId,
      method: defaultMethod(account),
    });
    afterEntrySaved(tx, name);
    showSnackbar(t('purchase.boughtSaved'));
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert(t('purchase.deleteTitle', { name: existing.name }), t('purchase.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deletePurchase(getDb(), existing.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen header={<Header back title={existing ? t('purchase.edit') : t('purchase.add')} />}>
      {bought ? (
        <Pill tone="positive" icon="check-circle-outline" label={t('purchase.bought')} />
      ) : null}
      <Field
        label={t('purchase.name')}
        placeholder={t('purchase.namePlaceholder')}
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
      />
      <Field
        label={t('purchase.price')}
        keyboardType="decimal-pad"
        value={price}
        onChangeText={setPrice}
        error={
          price.trim() !== '' && (priceValue === null || priceValue <= 0)
            ? t('common.invalidAmount')
            : null
        }
      />
      <View style={{ gap: 6 }}>
        <T variant="label" tone="muted">
          {t('purchase.priority')}
        </T>
        <Segmented<Priority>
          label={t('purchase.priority')}
          value={priority}
          onChange={setPriority}
          options={PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))}
        />
      </View>
      {!bought ? (
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">
            {t('purchase.status')}
          </T>
          <Segmented<PurchaseStatus>
            label={t('purchase.status')}
            value={status === 'bought' ? 'thinking' : status}
            onChange={setStatus}
            options={(['thinking', 'saving'] as PurchaseStatus[]).map((s) => ({
              value: s,
              label: t(PURCHASE_STATUS[s].key),
              icon: PURCHASE_STATUS[s].icon,
            }))}
          />
        </View>
      ) : null}
      <Field
        label={t('purchase.funding')}
        placeholder={t('purchase.fundingPlaceholder')}
        value={notes}
        onChangeText={setNotes}
        multiline
        style={{ minHeight: 84, textAlignVertical: 'top' }}
      />
      <Button label={t('common.save')} icon="check" onPress={save} disabled={!valid} />

      {existing && !bought ? (
        <>
          <SectionTitle>{t('purchase.buyTitle')}</SectionTitle>
          <Card style={{ gap: space.md }}>
            <T tone="muted">{t('purchase.buyBody')}</T>
            <Field
              label={t('purchase.paid')}
              keyboardType="decimal-pad"
              value={paidText}
              onChangeText={setPaid}
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
              <Chip
                icon={category?.icon ?? 'tag-outline'}
                iconColor={category?.color}
                label={category?.name ?? t('quick.category')}
                accessibilityLabel={`${t('quick.category')}: ${category?.name ?? t('common.none')}`}
                onPress={() => setSheet('category')}
              />
              <Chip
                icon="calendar-outline"
                label={dayLabel(t, day, today)}
                onPress={() => setSheet('day')}
              />
            </View>
            <Button
              label={t('purchase.markBought')}
              icon="cart-check"
              variant="secondary"
              onPress={buy}
              disabled={!account || paidValue === null || paidValue <= 0}
            />
          </Card>
        </>
      ) : null}
      {existing ? (
        <Button
          label={t('common.delete')}
          variant="ghost"
          icon="trash-can-outline"
          onPress={remove}
        />
      ) : null}

      <OptionSheet<string>
        visible={sheet === 'account'}
        title={t('quick.account')}
        options={accountOptions(accounts)}
        value={accountId ?? undefined}
        onSelect={setAccountId}
        onClose={() => setSheet(null)}
      />
      <CategorySheet
        visible={sheet === 'category'}
        title={t('quick.category')}
        categories={lookups.categories.filter((cat) => !cat.archived && cat.kind === 'expense')}
        value={categoryId}
        allowNone
        onSelect={setCategoryId}
        onClose={() => setSheet(null)}
      />
      {sheet === 'day' ? (
        <DayPicker
          visible
          value={day}
          today={today}
          onSelect={setDay}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Screen>
  );
}
