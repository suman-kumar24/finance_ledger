import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { getAccount, getBalances, listCardStatements } from '@/data/accounts';
import { loadLookups } from '@/data/queries';
import { listEntriesForAccount, listTransactions } from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { cardStatus, cycleHistory } from '@/domain/cards';
import { balanceToDisplay } from '@/domain/reconcile';
import { CardPanel } from '@/features/CardPanel';
import { TransactionRow } from '@/features/TransactionRow';
import { ACCOUNT_TYPE_LABEL } from '@/features/txDisplay';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  IconButton,
  Pill,
  Screen,
  SectionTitle,
  T,
} from '@/ui/kit';
import { space } from '@/ui/theme';

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { money } = useMoney();
  const today = useToday();
  const setFilter = useUi((s) => s.setFilter);
  const data = useLive(
    (db) => {
      const account = getAccount(db, id);
      if (!account) return null;
      const entries = account.type === 'credit_card' ? listEntriesForAccount(db, id) : [];
      const statements = listCardStatements(db, id);
      return {
        account,
        balance: getBalances(db).get(id) ?? account.openingBalance,
        status:
          account.type === 'credit_card' ? cardStatus(account, entries, today, statements) : null,
        cycles:
          account.type === 'credit_card'
            ? cycleHistory(account, entries, today, 6, statements)
            : [],
        recent: listTransactions(db, { accountIds: [id] }, { limit: 15, offset: 0 }),
        lookups: loadLookups(db),
      };
    },
    [id, today],
  );

  if (!data) {
    return (
      <Screen header={<Header back title={t('tab.accounts')} />}>
        <EmptyState icon="bank-off-outline" title={t('account.notFound')} />
      </Screen>
    );
  }
  const { account, balance, status, cycles, recent, lookups } = data;
  const shown = balanceToDisplay(account.type, balance);
  const isCard = account.type === 'credit_card';

  return (
    <Screen
      header={
        <Header
          back
          title={account.name}
          subtitle={`${t(ACCOUNT_TYPE_LABEL[account.type])}${account.last4 ? ` ··${account.last4}` : ''}`}
          right={
            <IconButton
              icon="pencil-outline"
              label={t('account.edit')}
              onPress={() => router.push({ pathname: '/account-edit', params: { id } })}
            />
          }
        />
      }
    >
      {account.archived ? (
        <Pill tone="neutral" icon="archive-outline" label={t('account.archivedPill')} />
      ) : null}
      <Card style={{ gap: space.md }}>
        {status ? (
          <CardPanel card={account} status={status} today={today} />
        ) : (
          <View accessible accessibilityLabel={`${t('account.balance')}: ${money(shown)}`}>
            <T variant="label" tone="muted">
              {t('account.balance')}
            </T>
            <T
              variant="display"
              numeric
              numberOfLines={1}
              adjustsFontSizeToFit
              tone={shown < 0 ? 'danger' : 'default'}
            >
              {money(shown)}
            </T>
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Button
            label={t('reconcile.action')}
            icon="scale-balance"
            variant="secondary"
            onPress={() => router.push({ pathname: '/reconcile', params: { id } })}
          />
          {isCard && status?.statementDate ? (
            <Button
              label={t('card.statementDetails')}
              icon="file-document-edit-outline"
              variant="ghost"
              onPress={() => router.push({ pathname: '/statement', params: { id } })}
            />
          ) : null}
        </View>
        <T variant="caption" tone="muted">
          {isCard
            ? t('account.openedOwing', {
                amount: money(-account.openingBalance),
                date: dayLabel(t, account.openingDate),
              })
            : t('account.openedWith', {
                amount: money(account.openingBalance),
                date: dayLabel(t, account.openingDate),
              })}
        </T>
      </Card>

      {cycles.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionTitle>{t('card.cycles')}</SectionTitle>
          <Card padded={false}>
            {cycles.map((cycle, index) => (
              <View key={cycle.statementDate}>
                {index > 0 ? <Divider /> : null}
                <View
                  accessible
                  style={{ padding: space.lg, gap: 2 }}
                  accessibilityLabel={t('card.cycleA11y', {
                    start: dayLabel(t, cycle.start),
                    end: dayLabel(t, cycle.end),
                    total: money(cycle.statementTotal),
                    purchases: money(cycle.purchases),
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <T style={{ flex: 1, fontWeight: '600' }}>
                      {dayLabel(t, cycle.start, today)} – {dayLabel(t, cycle.end, today)}
                    </T>
                    <T numeric style={{ fontWeight: '600' }}>
                      {money(cycle.statementTotal)}
                    </T>
                  </View>
                  <T variant="caption" tone="muted">
                    {cycle.open ? t('card.cycleOpen') : t('card.cycleClosed')}
                    {' · '}
                    {t('card.cycleSpent', { amount: money(cycle.purchases) })}
                    {cycle.credits > 0
                      ? ` · ${t('card.cycleCredits', { amount: money(cycle.credits) })}`
                      : ''}
                    {cycle.payments > 0
                      ? ` · ${t('card.cyclePaid', { amount: money(cycle.payments) })}`
                      : ''}
                  </T>
                  {cycle.dueDate ? (
                    <T variant="caption" tone="muted">
                      {t('card.dueOn', { date: dayLabel(t, cycle.dueDate, today) })}
                      {cycle.minimumDue !== null
                        ? ` · ${t('card.minDue', { amount: money(cycle.minimumDue) })}`
                        : ''}
                    </T>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionTitle
          action={
            recent.length > 0 ? (
              <Button
                label={t('common.seeAll')}
                variant="ghost"
                compact
                onPress={() => {
                  setFilter({ accountIds: [id] });
                  router.navigate('/(tabs)/transactions');
                }}
              />
            ) : undefined
          }
        >
          {t('account.recent')}
        </SectionTitle>
        <Card padded={false}>
          {recent.length === 0 ? (
            <EmptyState icon="receipt-text-outline" title={t('account.noTransactions')} />
          ) : (
            recent.map((tx, index) => (
              <View key={tx.id}>
                {index > 0 ? <Divider /> : null}
                <TransactionRow
                  tx={tx}
                  lookups={lookups}
                  showDay
                  onPress={(row) => router.push({ pathname: '/quick-add', params: { id: row.id } })}
                />
              </View>
            ))
          )}
        </Card>
      </View>
    </Screen>
  );
}
