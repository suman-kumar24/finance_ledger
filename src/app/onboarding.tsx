import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { createAccount, listAccounts } from '@/data/accounts';
import { createBudget, listBudgets } from '@/data/budgets';
import { batch } from '@/data/bus';
import { listCategories, seedDefaultCategories } from '@/data/categories';
import { currentPeriodKey } from '@/data/queries';
import { updateSettings, type Language } from '@/data/settings';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { BUDGET_TEMPLATES } from '@/domain/defaults';
import {
  CURRENCIES,
  currencyInfo,
  formatMoney,
  mulDiv,
  parseAmount,
  roundToMajor,
  type Grouping,
} from '@/domain/money';
import { periodFromKey } from '@/domain/months';
import {
  accountFormProblems,
  accountFormToInput,
  AccountFormFields,
  emptyAccountForm,
} from '@/features/AccountForm';
import { BackupConnect } from '@/features/BackupConnect';
import { PinSetup } from '@/features/PinSetup';
import { ACCOUNT_TYPE_LABEL } from '@/features/txDisplay';
import { useSettings } from '@/hooks/useSettings';
import { requestNotifications, syncNotifications } from '@/notify';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  Field,
  Icon,
  Pill,
  Row,
  Screen,
  Segmented,
  T,
} from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

const STEPS = ['welcome', 'money', 'month', 'accounts', 'budgets', 'lock', 'backup'] as const;
type Step = (typeof STEPS)[number];

const START_DAY_CHOICES = [1, 5, 7, 10, 15, 20, 25, 28, 30];

export default function Onboarding() {
  const t = useT();
  const c = useTheme();
  const today = useToday();
  const settings = useSettings();
  const [index, setIndex] = useState(0);
  const step: Step = STEPS[index] ?? 'welcome';
  const accounts = useLive((db) => listAccounts(db));
  const info = currencyInfo(settings.currency);

  const [form, setForm] = useState(() => emptyAccountForm(today));
  const [adding, setAdding] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [income, setIncome] = useState('');
  const [customDay, setCustomDay] = useState('');
  const [lockDone, setLockDone] = useState(false);

  const finish = () => {
    batch(() => {
      seedDefaultCategories(getDb(), settings.language);
      updateSettings(getDb(), { onboarded: true });
    });
    // Budget, bill and recurring alerts are on by default; ask for the permission
    // they need now, once, so they work from the first day.
    void requestNotifications()
      .then(() => syncNotifications(getDb()))
      .catch(() => undefined);
    router.replace('/(tabs)');
  };
  const next = () => (index >= STEPS.length - 1 ? finish() : setIndex(index + 1));
  const back = () => setIndex(Math.max(0, index - 1));

  const set = (patch: Parameters<typeof updateSettings>[1]) => updateSettings(getDb(), patch);

  const addAccount = () => {
    if (accountFormProblems(form, info.decimals).length > 0) {
      setShowErrors(true);
      return;
    }
    createAccount(getDb(), accountFormToInput(form, settings.currency));
    setForm(emptyAccountForm(today, 'bank', accounts.length + 1));
    setShowErrors(false);
    setAdding(false);
  };

  const incomeMinor = parseAmount(income, info.decimals);
  const suggestions = BUDGET_TEMPLATES.map((template) => ({
    template,
    limit:
      incomeMinor && incomeMinor > 0
        ? roundToMajor(mulDiv(incomeMinor, template.sharePercent, 100), info.decimals + 2)
        : 0,
  }));

  const createBudgets = () => {
    const db = getDb();
    batch(() => {
      seedDefaultCategories(db, settings.language);
      const period = currentPeriodKey(settings, today);
      if (listBudgets(db, period).length > 0) return;
      const byKey = new Map(listCategories(db).map((cat) => [cat.systemKey, cat.id]));
      for (const { template, limit } of suggestions) {
        if (limit <= 0) continue;
        createBudget(db, {
          name: template.name[settings.language],
          period,
          limit,
          recurring: true,
          categoryIds: template.categories
            .map((key) => byKey.get(key))
            .filter((id): id is string => Boolean(id)),
        });
      }
    });
    next();
  };

  const examplePeriod = periodFromKey(currentPeriodKey(settings, today), settings.monthStartDay);
  const money = (amount: number) =>
    formatMoney(amount, {
      currency: settings.currency,
      grouping: settings.grouping,
      fraction: 'never',
    });

  let title = '';
  let body = '';
  let content = null;
  let primary: { label: string; onPress: () => void; disabled?: boolean } | null = {
    label: t('common.next'),
    onPress: next,
  };

  switch (step) {
    case 'welcome':
      title = t('onb.welcomeTitle');
      body = t('onb.welcomeBody');
      content = (
        <View style={{ gap: space.lg }}>
          <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 28,
                backgroundColor: c.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="notebook-outline" size={52} color={c.onAccent} />
            </View>
          </View>
          <Segmented<Language>
            label={t('settings.language')}
            value={settings.language}
            onChange={(language) => set({ language })}
            options={[
              { value: 'en', label: 'English' },
              { value: 'hi', label: 'हिन्दी' },
            ]}
          />
          <Card padded={false}>
            <Row
              icon="cellphone-lock"
              title={t('onb.pointOffline')}
              subtitle={t('onb.pointOfflineBody')}
            />
            <Divider />
            <Row
              icon="credit-card-check-outline"
              title={t('onb.pointCards')}
              subtitle={t('onb.pointCardsBody')}
            />
            <Divider />
            <Row
              icon="incognito"
              title={t('onb.pointPrivate')}
              subtitle={t('onb.pointPrivateBody')}
            />
          </Card>
        </View>
      );
      primary = { label: t('onb.start'), onPress: next };
      break;

    case 'money':
      title = t('onb.moneyTitle');
      body = t('onb.moneyBody');
      content = (
        <View style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {Object.values(CURRENCIES).map((cur) => (
              <Chip
                key={cur.code}
                label={`${cur.symbol.trim()} ${cur.code}`}
                accessibilityLabel={cur.name}
                selected={settings.currency === cur.code}
                onPress={() => set({ currency: cur.code, grouping: cur.defaultGrouping })}
              />
            ))}
          </View>
          <View style={{ gap: 6 }}>
            <T variant="label" tone="muted">
              {t('settings.numberFormat')}
            </T>
            <Segmented<Grouping>
              label={t('settings.numberFormat')}
              value={settings.grouping}
              onChange={(grouping) => set({ grouping })}
              options={[
                { value: 'indian', label: '1,00,000' },
                { value: 'western', label: '100,000' },
              ]}
            />
          </View>
          <Card>
            <T variant="caption" tone="muted">
              {t('onb.example')}
            </T>
            <T variant="title" numeric>
              {formatMoney(12345678_50, {
                currency: settings.currency,
                grouping: settings.grouping,
              })}
            </T>
          </Card>
        </View>
      );
      break;

    case 'month':
      title = t('onb.monthTitle');
      body = t('onb.monthBody');
      content = (
        <View style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {START_DAY_CHOICES.map((day) => (
              <Chip
                key={day}
                label={day === 1 ? t('onb.calendarMonth') : t('onb.dayN', { day })}
                selected={settings.monthStartDay === day}
                onPress={() => set({ monthStartDay: day })}
              />
            ))}
          </View>
          <Field
            label={t('onb.otherDay')}
            placeholder="1–31"
            keyboardType="number-pad"
            maxLength={2}
            value={customDay}
            onChangeText={(value) => {
              setCustomDay(value);
              const n = Number(value);
              if (Number.isInteger(n) && n >= 1 && n <= 31) set({ monthStartDay: n });
            }}
          />
          <Card>
            <T variant="caption" tone="muted">
              {t('onb.thisMonthRuns')}
            </T>
            <T variant="heading">
              {dayLabel(t, examplePeriod.start)} – {dayLabel(t, examplePeriod.end)}
            </T>
          </Card>
        </View>
      );
      break;

    case 'accounts':
      title = t('onb.accountsTitle');
      body = t('onb.accountsBody');
      content = (
        <View style={{ gap: space.lg }}>
          {accounts.length > 0 ? (
            <Card padded={false}>
              {accounts.map((account, i) => (
                <View key={account.id}>
                  {i > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.lg,
                    }}
                  >
                    <Avatar icon={account.icon} color={account.color} />
                    <View style={{ flex: 1 }}>
                      <T style={{ fontWeight: '500' }}>{account.name}</T>
                      <T variant="caption" tone="muted">
                        {t(ACCOUNT_TYPE_LABEL[account.type])}
                      </T>
                    </View>
                    <T numeric style={{ fontWeight: '600' }}>
                      {money(Math.abs(account.openingBalance))}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          {adding || accounts.length === 0 ? (
            <Card style={{ gap: space.lg }}>
              <AccountFormFields
                state={form}
                onChange={(patch) => setForm((s) => ({ ...s, ...patch }))}
                today={today}
                currency={settings.currency}
                showErrors={showErrors}
              />
              <Button
                label={t('onb.addThisAccount')}
                icon="plus"
                variant="secondary"
                onPress={addAccount}
              />
            </Card>
          ) : (
            <Button
              label={t('onb.addAnother')}
              icon="plus"
              variant="secondary"
              onPress={() => setAdding(true)}
            />
          )}
        </View>
      );
      break;

    case 'budgets':
      title = t('onb.budgetsTitle');
      body = t('onb.budgetsBody');
      content = (
        <View style={{ gap: space.lg }}>
          <Field
            label={t('onb.monthlyIncome', { symbol: info.symbol.trim() })}
            hint={t('onb.incomeHint')}
            keyboardType="decimal-pad"
            value={income}
            onChangeText={setIncome}
            placeholder="0"
          />
          <Card padded={false}>
            {suggestions.map(({ template, limit }, i) => (
              <View key={template.key}>
                {i > 0 ? <Divider /> : null}
                <Row
                  title={template.name[settings.language]}
                  subtitle={t('onb.shareOfIncome', { percent: template.sharePercent })}
                  right={
                    <T numeric style={{ fontWeight: '600' }}>
                      {limit > 0 ? money(limit) : '—'}
                    </T>
                  }
                />
              </View>
            ))}
          </Card>
          <T variant="caption" tone="muted">
            {t('onb.budgetsEditLater')}
          </T>
        </View>
      );
      primary = {
        label: t('onb.useTheseBudgets'),
        onPress: createBudgets,
        disabled: !incomeMinor || incomeMinor <= 0,
      };
      break;

    case 'lock':
      title = t('onb.lockTitle');
      body = t('onb.lockBody');
      content =
        lockDone || settings.lockEnabled ? (
          <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
            <Pill tone="positive" icon="check-circle-outline" label={t('lock.isOn')} />
          </View>
        ) : (
          <PinSetup onDone={() => setLockDone(true)} />
        );
      primary =
        lockDone || settings.lockEnabled ? { label: t('common.next'), onPress: next } : null;
      break;

    case 'backup':
      title = t('onb.backupTitle');
      body = t('onb.backupBody');
      content = (
        <Card>
          <BackupConnect />
        </Card>
      );
      primary = { label: t('onb.finish'), onPress: finish };
      break;
  }

  return (
    <Screen
      footer={
        <View style={{ gap: space.sm }}>
          {primary ? (
            <Button label={primary.label} onPress={primary.onPress} disabled={primary.disabled} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {index > 0 ? (
              <Button label={t('common.back')} variant="ghost" onPress={back} style={{ flex: 1 }} />
            ) : null}
            {step !== 'welcome' ? (
              <Button
                label={index >= STEPS.length - 1 ? t('onb.skipFinish') : t('common.skip')}
                variant="ghost"
                onPress={next}
                style={{ flex: 1 }}
                accessibilityHint={t('onb.skipHint')}
              />
            ) : null}
          </View>
        </View>
      }
    >
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('onb.stepOf', { step: index + 1, total: STEPS.length })}
        accessibilityValue={{ min: 1, max: STEPS.length, now: index + 1 }}
        style={{ flexDirection: 'row', gap: 6 }}
      >
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= index ? c.accent : c.track,
            }}
          />
        ))}
      </View>
      <View style={{ gap: space.sm }}>
        <T variant="title" accessibilityRole="header">
          {title}
        </T>
        <T tone="muted">{body}</T>
      </View>
      {content}
    </Screen>
  );
}
