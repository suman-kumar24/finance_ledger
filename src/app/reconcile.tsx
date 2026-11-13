import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { getAccount, getBalances } from '@/data/accounts';
import { listCategories } from '@/data/categories';
import { lastReconciliation, recordReconciliation } from '@/data/reconcile';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { currencyInfo, parseAmount } from '@/domain/money';
import { balanceToDisplay, reconcile } from '@/domain/reconcile';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { Banner, Button, Card, Chip, EmptyState, Field, Header, Screen, T } from '@/ui/kit';
import { CategorySheet } from '@/ui/Pickers';
import { space } from '@/ui/theme';

export default function Reconcile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const today = useToday();
  const { money, currency } = useMoney();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const setFilter = useUi((s) => s.setFilter);
  const [entered, setEntered] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const data = useLive(
    (db) => {
      const account = getAccount(db, id);
      if (!account) return null;
      return {
        account,
        balance: getBalances(db).get(id) ?? account.openingBalance,
        categories: listCategories(db),
        last: lastReconciliation(db, id),
      };
    },
    [id],
  );
  if (!data) {
    return (
      <Screen header={<Header back title={t('reconcile.title')} />}>
        <EmptyState icon="bank-off-outline" title={t('account.notFound')} />
      </Screen>
    );
  }
  const { account, balance, categories, last } = data;
  const isCard = account.type === 'credit_card';
  const decimals = currencyInfo(currency).decimals;
  const parsed = entered.trim() === '' ? null : parseAmount(entered, decimals);
  const result = parsed === null ? null : reconcile(account, balance, parsed);
  const category = categories.find((cat) => cat.id === categoryId);
  const gap = result ? Math.abs(result.difference) : 0;

  const finish = (adjust: boolean) => {
    if (!result) return;
    recordReconciliation(getDb(), id, result, today, { adjust, categoryId });
    showSnackbar(adjust ? t('reconcile.adjusted') : t('reconcile.recorded'));
    router.back();
  };

  return (
    <Screen header={<Header back title={t('reconcile.title')} subtitle={account.name} />}>
      <Card style={{ gap: space.sm }}>
        <T variant="label" tone="muted">
          {isCard ? t('reconcile.appOwed') : t('reconcile.appBalance')}
        </T>
        <T variant="title" numeric>
          {money(balanceToDisplay(account.type, balance))}
        </T>
        {last ? (
          <T variant="caption" tone="muted">
            {t('reconcile.lastChecked', { date: dayLabel(t, last.day) })}
          </T>
        ) : null}
      </Card>

      <Field
        label={isCard ? t('reconcile.enterOwed') : t('reconcile.enterBalance')}
        hint={isCard ? t('reconcile.enterOwedHint') : t('reconcile.enterBalanceHint')}
        keyboardType="numbers-and-punctuation"
        value={entered}
        onChangeText={setEntered}
        placeholder="0"
        error={entered.trim() !== '' && parsed === null ? t('common.invalidAmount') : null}
      />

      {result?.matched ? (
        <>
          <Banner
            tone="positive"
            icon="check-circle-outline"
            title={t('reconcile.matched')}
            body={t('reconcile.matchedBody')}
          />
          <Button label={t('reconcile.markChecked')} icon="check" onPress={() => finish(false)} />
        </>
      ) : null}

      {result && !result.matched ? (
        <>
          <Banner
            tone="warning"
            icon="alert-outline"
            title={t('reconcile.difference', { amount: money(gap) })}
            body={
              result.direction === 'missing_spend'
                ? t(isCard ? 'reconcile.cardOwesMore' : 'reconcile.bankHasLess')
                : t(isCard ? 'reconcile.cardOwesLess' : 'reconcile.bankHasMore')
            }
          />
          <Card style={{ gap: space.md }}>
            <T variant="heading">{t('reconcile.optionReview')}</T>
            <T tone="muted">{t('reconcile.optionReviewBody')}</T>
            <Button
              label={t('reconcile.reviewRecent')}
              icon="format-list-bulleted"
              variant="secondary"
              onPress={() => {
                setFilter({ accountIds: [id] });
                router.navigate('/(tabs)/transactions');
              }}
            />
          </Card>
          <Card style={{ gap: space.md }}>
            <T variant="heading">{t('reconcile.optionAdjust')}</T>
            <T tone="muted">
              {t('reconcile.optionAdjustBody', {
                amount: money(result.difference, { sign: 'always' }),
              })}
            </T>
            <View style={{ flexDirection: 'row' }}>
              <Chip
                icon={category?.icon ?? 'tag-outline'}
                iconColor={category?.color}
                label={category ? category.name : t('reconcile.noCategory')}
                accessibilityLabel={`${t('quick.category')}: ${category?.name ?? t('common.none')}`}
                onPress={() => setPicking(true)}
              />
            </View>
            <T variant="caption" tone="muted">
              {category
                ? category.kind === 'expense'
                  ? t('reconcile.countsAsSpending')
                  : t('reconcile.countsAsIncome')
                : t('reconcile.notCounted')}
            </T>
            <Button
              label={t('reconcile.createAdjustment')}
              icon="scale-balance"
              onPress={() => finish(true)}
            />
          </Card>
        </>
      ) : null}

      <CategorySheet
        visible={picking}
        title={t('quick.category')}
        categories={categories}
        value={categoryId}
        allowNone
        onSelect={setCategoryId}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}
