import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { listAccounts } from '@/data/accounts';
import {
  addContribution,
  createGoal,
  deleteContribution,
  deleteGoal,
  getGoal,
  listContributions,
  updateGoal,
} from '@/data/plans';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import type { Day } from '@/domain/dates';
import { PALETTE } from '@/domain/defaults';
import { goalProgress } from '@/domain/goals';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { isSavingType } from '@/domain/types';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { Ring } from '@/ui/charts';
import { DayPicker } from '@/ui/DayPicker';
import {
  Button,
  Card,
  Chip,
  Divider,
  Field,
  Header,
  Icon,
  IconButton,
  Screen,
  SectionTitle,
  Segmented,
  T,
} from '@/ui/kit';
import { accountOptions, OptionSheet } from '@/ui/Pickers';
import { space, useTheme } from '@/ui/theme';

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useT();
  const c = useTheme();
  const today = useToday();
  const { money, currency } = useMoney();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const decimals = currencyInfo(currency).decimals;
  const data = useLive(
    (db) => ({
      goal: id ? getGoal(db, id) : null,
      contributions: id ? listContributions(db, id) : [],
      accounts: listAccounts(db),
    }),
    [id],
  );
  const { goal, contributions, accounts } = data;
  const text = (value: number) => toDecimalString(value, decimals).replace(/\.0+$/, '');

  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? text(goal.targetAmount) : '');
  const [targetDate, setTargetDate] = useState<Day | null>(goal?.targetDate ?? null);
  const [accountId, setAccountId] = useState<string | null>(goal?.accountId ?? null);
  const [color, setColor] = useState(goal?.color ?? PALETTE[0] ?? '#0F7B6C');
  const [editing, setEditing] = useState(!goal);
  const [sheet, setSheet] = useState<'date' | 'account' | 'from' | 'day' | null>(null);

  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'add' | 'withdraw'>('add');
  const [fromId, setFromId] = useState<string | null>(null);
  const [day, setDay] = useState(today);

  const targetValue = parseAmount(target, decimals);
  const valid = name.trim() !== '' && targetValue !== null && targetValue > 0;
  const savingAccounts = accounts.filter((a) => isSavingType(a.type));
  const linked = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  const sources = accounts.filter((a) => a.id !== goal?.accountId && a.type !== 'credit_card');
  const from = fromId ? accounts.find((a) => a.id === fromId) : undefined;

  const save = () => {
    if (!valid || targetValue === null) return;
    const input = { name, targetAmount: targetValue, targetDate, accountId, color, icon: 'target' };
    if (goal) {
      updateGoal(getDb(), goal.id, input);
      setEditing(false);
    } else {
      const created = createGoal(getDb(), input);
      router.replace({ pathname: '/goal', params: { id: created.id } });
    }
    showSnackbar(t('goal.saved'));
  };

  const contribute = () => {
    if (!goal) return;
    const value = parseAmount(amount, decimals);
    if (value === null || value <= 0) return;
    addContribution(
      getDb(),
      { goalId: goal.id, amount: direction === 'add' ? value : -value, day, fromAccountId: fromId },
      today,
    );
    setAmount('');
    showSnackbar(t('goal.contributionSaved'));
  };

  const remove = () => {
    if (!goal) return;
    Alert.alert(t('goal.deleteTitle', { name: goal.name }), t('goal.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteGoal(getDb(), goal.id);
          router.back();
        },
      },
    ]);
  };

  const progress = goal ? goalProgress(goal, contributions, today) : null;
  const amountValue = parseAmount(amount, decimals);

  return (
    <Screen
      header={
        <Header
          back
          title={goal ? goal.name : t('goal.add')}
          right={
            goal && !editing ? (
              <IconButton
                icon="pencil-outline"
                label={t('goal.edit')}
                onPress={() => setEditing(true)}
              />
            ) : undefined
          }
        />
      }
    >
      {goal && progress && !editing ? (
        <>
          <Card style={{ alignItems: 'center', gap: space.md }}>
            <Ring
              fraction={progress.fraction}
              size={132}
              stroke={12}
              color={goal.color}
              label={t('goal.progressA11y', {
                saved: money(progress.saved),
                target: money(goal.targetAmount),
                percent: progress.percent,
              })}
            >
              <T variant="title" numeric maxFontSizeMultiplier={1.2}>
                {Math.min(progress.percent, 999)}%
              </T>
            </Ring>
            <T variant="heading" numeric>
              {money(progress.saved)} / {money(goal.targetAmount)}
            </T>
            {progress.state === 'reached' ? (
              <T tone="positive" variant="label">
                {t('goal.reached')}
              </T>
            ) : (
              <>
                <T tone="muted" center>
                  {t('goal.remaining', { amount: money(progress.remaining) })}
                  {goal.targetDate
                    ? ` · ${t('goal.by', { date: dayLabel(t, goal.targetDate, today) })}`
                    : ''}
                </T>
                {progress.monthlyNeeded !== null ? (
                  <View
                    accessible
                    style={{ alignItems: 'center' }}
                    accessibilityLabel={t('goal.perMonthA11y', {
                      amount: money(progress.monthlyNeeded),
                      months: progress.monthsLeft ?? 0,
                    })}
                  >
                    <T variant="title" tone="accent" numeric>
                      {money(progress.monthlyNeeded, { fraction: 'never' })}
                    </T>
                    <T variant="caption" tone="muted">
                      {progress.state === 'past_due'
                        ? t('goal.pastDueLine')
                        : t('goal.perMonthLine', { months: progress.monthsLeft ?? 0 })}
                    </T>
                  </View>
                ) : (
                  <T variant="caption" tone="muted">
                    {t('goal.noDate')}
                  </T>
                )}
              </>
            )}
            {linked ? (
              <T variant="caption" tone="muted">
                {t('goal.linkedTo', { name: linked.name })}
              </T>
            ) : null}
          </Card>

          <SectionTitle>{t('goal.addMoney')}</SectionTitle>
          <Card style={{ gap: space.md }}>
            <Segmented<'add' | 'withdraw'>
              label={t('goal.addMoney')}
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'add', label: t('goal.add'), icon: 'plus' },
                { value: 'withdraw', label: t('goal.withdraw'), icon: 'minus' },
              ]}
            />
            <Field
              label={t('recurring.amount')}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Chip
                icon="calendar-outline"
                label={dayLabel(t, day, today)}
                onPress={() => setSheet('day')}
              />
              {goal.accountId ? (
                <Chip
                  icon={from?.icon ?? 'bank-outline'}
                  iconColor={from?.color}
                  label={
                    from
                      ? direction === 'add'
                        ? t('goal.fromAccount', { name: from.name })
                        : t('goal.toAccount', { name: from.name })
                      : t('goal.noTransfer')
                  }
                  selected={Boolean(from)}
                  onPress={() => (from ? setFromId(null) : setSheet('from'))}
                />
              ) : null}
            </View>
            {goal.accountId ? (
              <T variant="caption" tone="muted">
                {from
                  ? t('goal.transferExplain', { name: linked?.name ?? '' })
                  : t('goal.noTransferExplain')}
              </T>
            ) : null}
            <Button
              label={direction === 'add' ? t('goal.addMoney') : t('goal.withdraw')}
              icon="check"
              onPress={contribute}
              disabled={amountValue === null || amountValue <= 0}
            />
          </Card>

          {contributions.length > 0 ? (
            <>
              <SectionTitle>{t('goal.history')}</SectionTitle>
              <Card padded={false}>
                {contributions.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <Divider /> : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingLeft: space.lg,
                        minHeight: 56,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <T
                          numeric
                          style={{ fontWeight: '600' }}
                          tone={item.amount < 0 ? 'default' : 'positive'}
                        >
                          {money(item.amount, { sign: 'always' })}
                        </T>
                        <T variant="caption" tone="muted">
                          {dayLabel(t, item.day, today)}
                          {item.transactionId ? ` · ${t('type.transfer')}` : ''}
                        </T>
                      </View>
                      <IconButton
                        icon="close"
                        label={t('goal.removeContribution', { amount: money(item.amount) })}
                        color={c.textMuted}
                        onPress={() => deleteContribution(getDb(), item.id)}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Field
            label={t('goal.name')}
            placeholder={t('goal.namePlaceholder')}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <Field
            label={t('goal.target')}
            keyboardType="decimal-pad"
            value={target}
            onChangeText={setTarget}
            error={
              target.trim() !== '' && (targetValue === null || targetValue <= 0)
                ? t('common.invalidAmount')
                : null
            }
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Chip
              icon="calendar-check-outline"
              label={
                targetDate
                  ? t('goal.by', { date: dayLabel(t, targetDate, today) })
                  : t('goal.pickDate')
              }
              selected={targetDate !== null}
              onPress={() => (targetDate ? setTargetDate(null) : setSheet('date'))}
            />
            {savingAccounts.length > 0 ? (
              <Chip
                icon={linked?.icon ?? 'piggy-bank-outline'}
                iconColor={linked?.color}
                label={linked ? t('goal.linkedTo', { name: linked.name }) : t('goal.linkAccount')}
                selected={Boolean(linked)}
                onPress={() => (linked ? setAccountId(null) : setSheet('account'))}
              />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {PALETTE.map((item, i) => (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityLabel={t('common.colourN', { n: i + 1 })}
                accessibilityState={{ selected: color === item, checked: color === item }}
                onPress={() => setColor(item)}
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: item,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: color === item ? 3 : 0,
                    borderColor: c.text,
                  }}
                >
                  {color === item ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
                </View>
              </Pressable>
            ))}
          </View>
          <Button label={t('common.save')} icon="check" onPress={save} disabled={!valid} />
          {goal ? (
            <>
              <Button
                label={t('common.cancel')}
                variant="ghost"
                onPress={() => setEditing(false)}
              />
              <Button
                label={t('goal.delete')}
                variant="ghost"
                icon="trash-can-outline"
                onPress={remove}
              />
            </>
          ) : null}
        </>
      )}

      <OptionSheet<string>
        visible={sheet === 'account'}
        title={t('goal.linkAccount')}
        options={accountOptions(savingAccounts)}
        value={accountId ?? undefined}
        onSelect={setAccountId}
        onClose={() => setSheet(null)}
      />
      <OptionSheet<string>
        visible={sheet === 'from'}
        title={t('quick.account')}
        options={accountOptions(sources)}
        value={fromId ?? undefined}
        onSelect={setFromId}
        onClose={() => setSheet(null)}
      />
      {sheet === 'date' || sheet === 'day' ? (
        <DayPicker
          visible
          value={sheet === 'date' ? (targetDate ?? today) : day}
          today={today}
          minDay={sheet === 'date' ? today : undefined}
          onSelect={(picked) => (sheet === 'date' ? setTargetDate(picked) : setDay(picked))}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Screen>
  );
}
