import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { AccountInput } from '@/data/accounts';
import type { Day } from '@/domain/dates';
import { ACCOUNT_ICONS, PALETTE } from '@/domain/defaults';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { ACCOUNT_TYPES, type Account, type AccountType } from '@/domain/types';
import { dayLabel, useT } from '@/i18n';
import { DayPicker } from '@/ui/DayPicker';
import { Chip, Field, Icon, T } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

import { ACCOUNT_TYPE_LABEL } from './txDisplay';

export interface AccountFormState {
  name: string;
  type: AccountType;
  /** For cards: the amount owed. Otherwise the balance. */
  opening: string;
  openingDate: Day;
  creditLimit: string;
  statementDay: string;
  dueDay: string;
  last4: string;
  color: string;
}

export function emptyAccountForm(
  today: Day,
  type: AccountType = 'bank',
  index = 0,
): AccountFormState {
  return {
    name: '',
    type,
    opening: '',
    openingDate: today,
    creditLimit: '',
    statementDay: '',
    dueDay: '',
    last4: '',
    color: PALETTE[index % PALETTE.length] ?? '#0F7B6C',
  };
}

export function accountFormFrom(account: Account, decimals: number): AccountFormState {
  const shown = account.type === 'credit_card' ? -account.openingBalance : account.openingBalance;
  const text = (value: number | null) =>
    value === null ? '' : toDecimalString(value, decimals).replace(/\.0+$/, '');
  return {
    name: account.name,
    type: account.type,
    opening: shown === 0 ? '' : text(shown),
    openingDate: account.openingDate,
    creditLimit: text(account.creditLimit),
    statementDay: account.statementDay === null ? '' : String(account.statementDay),
    dueDay: account.dueDay === null ? '' : String(account.dueDay),
    last4: account.last4 ?? '',
    color: account.color,
  };
}

function dayOfMonth(text: string): number | null {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export type AccountFormProblem = 'name' | 'opening' | 'statementDay' | 'dueDay' | 'creditLimit';

export function accountFormProblems(
  state: AccountFormState,
  decimals: number,
): AccountFormProblem[] {
  const problems: AccountFormProblem[] = [];
  if (state.name.trim() === '') problems.push('name');
  if (state.opening.trim() !== '' && parseAmount(state.opening, decimals) === null)
    problems.push('opening');
  if (state.type === 'credit_card') {
    if (state.statementDay.trim() !== '' && dayOfMonth(state.statementDay) === null)
      problems.push('statementDay');
    if (state.dueDay.trim() !== '' && dayOfMonth(state.dueDay) === null) problems.push('dueDay');
    if (state.creditLimit.trim() !== '' && (parseAmount(state.creditLimit, decimals) ?? -1) < 0) {
      problems.push('creditLimit');
    }
  }
  return problems;
}

export function accountFormToInput(state: AccountFormState, currency: string): AccountInput {
  const decimals = currencyInfo(currency).decimals;
  const entered = parseAmount(state.opening || '0', decimals) ?? 0;
  const isCard = state.type === 'credit_card';
  return {
    name: state.name,
    type: state.type,
    // A card's opening figure is what is owed, stored as a negative balance.
    openingBalance: isCard ? (entered === 0 ? 0 : -entered) : entered,
    openingDate: state.openingDate,
    currency,
    color: state.color,
    icon: ACCOUNT_ICONS[state.type],
    creditLimit:
      isCard && state.creditLimit.trim() ? parseAmount(state.creditLimit, decimals) : null,
    statementDay: isCard ? dayOfMonth(state.statementDay) : null,
    dueDay: isCard ? dayOfMonth(state.dueDay) : null,
    last4: state.last4,
  };
}

/** The fields for adding or editing an account; used in onboarding and Accounts. */
export function AccountFormFields({
  state,
  onChange,
  today,
  currency,
  lockType,
  showErrors,
}: {
  state: AccountFormState;
  onChange: (patch: Partial<AccountFormState>) => void;
  today: Day;
  currency: string;
  lockType?: boolean;
  showErrors?: boolean;
}) {
  const t = useT();
  const c = useTheme();
  const [pickDate, setPickDate] = useState(false);
  const info = currencyInfo(currency);
  const problems = showErrors ? accountFormProblems(state, info.decimals) : [];
  const isCard = state.type === 'credit_card';
  return (
    <View style={{ gap: space.lg }}>
      {!lockType ? (
        <View style={{ gap: 6 }}>
          <T variant="label" tone="muted">
            {t('account.type')}
          </T>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm }}
            keyboardShouldPersistTaps="handled"
            accessibilityRole="radiogroup"
            accessibilityLabel={t('account.type')}
          >
            {ACCOUNT_TYPES.map((type) => (
              <Chip
                key={type}
                label={t(ACCOUNT_TYPE_LABEL[type])}
                icon={ACCOUNT_ICONS[type]}
                selected={state.type === type}
                onPress={() => onChange({ type })}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Field
        label={t('account.name')}
        placeholder={isCard ? t('account.namePlaceholderCard') : t('account.namePlaceholder')}
        value={state.name}
        onChangeText={(name) => onChange({ name })}
        error={problems.includes('name') ? t('account.nameRequired') : null}
        autoCapitalize="words"
      />
      <Field
        label={
          isCard
            ? t('account.openingOwed', { symbol: info.symbol.trim() })
            : t('account.openingBalance', { symbol: info.symbol.trim() })
        }
        hint={isCard ? t('account.openingOwedHint') : t('account.openingHint')}
        placeholder="0"
        keyboardType="decimal-pad"
        value={state.opening}
        onChangeText={(opening) => onChange({ opening })}
        error={problems.includes('opening') ? t('common.invalidAmount') : null}
      />
      <View style={{ gap: 6 }}>
        <T variant="label" tone="muted">
          {t('account.openingDate')}
        </T>
        <View style={{ flexDirection: 'row' }}>
          <Chip
            icon="calendar-outline"
            label={dayLabel(t, state.openingDate)}
            accessibilityLabel={`${t('account.openingDate')}: ${dayLabel(t, state.openingDate)}`}
            onPress={() => setPickDate(true)}
          />
        </View>
      </View>
      {isCard ? (
        <>
          <Field
            label={t('account.creditLimit', { symbol: info.symbol.trim() })}
            placeholder={t('common.optional')}
            keyboardType="decimal-pad"
            value={state.creditLimit}
            onChangeText={(creditLimit) => onChange({ creditLimit })}
            error={problems.includes('creditLimit') ? t('common.invalidAmount') : null}
          />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t('account.statementDay')}
                placeholder="1–31"
                keyboardType="number-pad"
                maxLength={2}
                value={state.statementDay}
                onChangeText={(statementDay) => onChange({ statementDay })}
                error={problems.includes('statementDay') ? t('account.dayInvalid') : null}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={t('account.dueDay')}
                placeholder="1–31"
                keyboardType="number-pad"
                maxLength={2}
                value={state.dueDay}
                onChangeText={(dueDay) => onChange({ dueDay })}
                error={problems.includes('dueDay') ? t('account.dayInvalid') : null}
              />
            </View>
          </View>
          <T variant="caption" tone="muted">
            {t('account.cycleHint')}
          </T>
        </>
      ) : null}
      <Field
        label={t('account.last4')}
        hint={t('account.last4Hint')}
        placeholder={t('common.optional')}
        keyboardType="number-pad"
        maxLength={4}
        value={state.last4}
        onChangeText={(last4) => onChange({ last4 })}
      />
      <View style={{ gap: 6 }}>
        <T variant="label" tone="muted">
          {t('common.colour')}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {PALETTE.map((color, index) => (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityLabel={t('common.colourN', { n: index + 1 })}
              accessibilityState={{
                selected: state.color === color,
                checked: state.color === color,
              }}
              onPress={() => onChange({ color })}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: state.color === color ? 2 : 0,
                borderColor: c.text,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {state.color === color ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          ))}
        </View>
      </View>
      {pickDate ? (
        <DayPicker
          visible
          value={state.openingDate}
          today={today}
          onClose={() => setPickDate(false)}
          onSelect={(openingDate) => onChange({ openingDate })}
        />
      ) : null}
    </View>
  );
}
