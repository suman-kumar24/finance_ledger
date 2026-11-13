import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { getAccount, getBalances, listAccounts, listCardStatements } from '@/data/accounts';
import { createTransaction, listEntriesForAccount } from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { cardStatus } from '@/domain/cards';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { DayPicker } from '@/ui/DayPicker';
import { Banner, Button, Card, Chip, EmptyState, Field, Header, Screen, T } from '@/ui/kit';
import { accountOptions, OptionSheet } from '@/ui/Pickers';
import { space } from '@/ui/theme';

export default function PayBill() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const today = useToday();
  const { money, currency } = useMoney();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const decimals = currencyInfo(currency).decimals;
  const data = useLive(
    (db) => {
      const card = getAccount(db, id);
      if (!card || card.type !== 'credit_card') return null;
      return {
        card,
        status: cardStatus(card, listEntriesForAccount(db, id), today, listCardStatements(db, id)),
        sources: listAccounts(db).filter(
          (a) => a.type !== 'credit_card' && a.type !== 'investment',
        ),
        balances: getBalances(db),
      };
    },
    [id, today],
  );
  const text = (amount: number) => toDecimalString(amount, decimals).replace(/\.0+$/, '');
  const [amount, setAmount] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [day, setDay] = useState(today);
  const [sheet, setSheet] = useState<'from' | 'date' | null>(null);

  if (!data) {
    return (
      <Screen header={<Header back title={t('card.payBill')} />}>
        <EmptyState icon="credit-card-off-outline" title={t('account.notFound')} />
      </Screen>
    );
  }
  const { card, status, sources, balances } = data;
  const suggested = status.currentBill > 0 ? status.currentBill : Math.max(0, status.outstanding);
  const amountText = amount ?? (suggested > 0 ? text(suggested) : '');
  const sourceId = fromId ?? sources.find((a) => a.type === 'bank')?.id ?? sources[0]?.id ?? null;
  const source = sources.find((a) => a.id === sourceId);
  const parsed = parseAmount(amountText, decimals);
  const valid = parsed !== null && parsed > 0 && source !== undefined;
  const sourceBalance = source ? (balances.get(source.id) ?? 0) : 0;

  const pay = () => {
    if (!valid || !source) return;
    createTransaction(getDb(), {
      type: 'card_payment',
      amount: parsed,
      day,
      accountId: source.id,
      toAccountId: card.id,
      payee: t('card.paymentPayee', { name: card.name }),
      status: day > today ? 'scheduled' : 'cleared',
    });
    showSnackbar(day > today ? t('quick.savedScheduled') : t('card.paymentSaved'));
    router.back();
  };

  return (
    <Screen
      header={<Header back title={t('card.payBill')} subtitle={card.name} />}
      footer={
        <Button label={t('card.recordPayment')} icon="check" onPress={pay} disabled={!valid} />
      }
    >
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T variant="caption" tone="muted">
              {t('card.currentBill')}
            </T>
            <T variant="heading" numeric>
              {money(status.currentBill)}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="caption" tone="muted">
              {t('card.outstanding')}
            </T>
            <T variant="heading" numeric>
              {money(status.outstanding)}
            </T>
          </View>
        </View>
        {status.dueDate && status.currentBill > 0 ? (
          <T variant="caption" tone="muted">
            {t('card.dueOn', { date: dayLabel(t, status.dueDate, today) })}
            {status.minimumDue !== null
              ? ` · ${t('card.minDue', { amount: money(status.minimumDue) })}`
              : ''}
          </T>
        ) : null}
      </Card>

      <Field
        label={t('card.payAmount')}
        keyboardType="decimal-pad"
        value={amountText}
        onChangeText={setAmount}
        error={
          amountText.trim() !== '' && (parsed === null || parsed <= 0)
            ? t('common.invalidAmount')
            : null
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {status.currentBill > 0 ? (
          <Chip label={t('card.payFullBill')} onPress={() => setAmount(text(status.currentBill))} />
        ) : null}
        {status.minimumDue !== null && status.minimumDue > 0 ? (
          <Chip
            label={t('card.payMinimum')}
            onPress={() => setAmount(text(status.minimumDue ?? 0))}
          />
        ) : null}
        {status.outstanding > status.currentBill ? (
          <Chip label={t('card.payAll')} onPress={() => setAmount(text(status.outstanding))} />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Chip
          icon={source?.icon ?? 'bank-outline'}
          iconColor={source?.color}
          label={source ? t('card.payFrom', { name: source.name }) : t('quick.chooseAccount')}
          highlight={!source}
          onPress={() => setSheet('from')}
        />
        <Chip
          icon="calendar-outline"
          label={dayLabel(t, day, today)}
          onPress={() => setSheet('date')}
        />
      </View>

      {sources.length === 0 ? (
        <Banner tone="warning" icon="alert-outline" title={t('card.needSource')} />
      ) : valid && parsed > sourceBalance ? (
        <Banner
          tone="warning"
          icon="alert-outline"
          title={t('card.lowBalance', { name: source?.name ?? '', amount: money(sourceBalance) })}
        />
      ) : null}
      <T variant="caption" tone="muted">
        {t('card.paymentNote')}
      </T>

      <OptionSheet
        visible={sheet === 'from'}
        title={t('quick.from')}
        options={accountOptions(sources, (a) => money(balances.get(a.id) ?? 0))}
        value={sourceId}
        onSelect={setFromId}
        onClose={() => setSheet(null)}
      />
      {sheet === 'date' ? (
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
