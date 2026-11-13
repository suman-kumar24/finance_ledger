import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { loadAccountsView } from '@/data/queries';
import { useLive } from '@/data/useLive';
import { ACCOUNT_TYPES, type Account } from '@/domain/types';
import { balanceToDisplay } from '@/domain/reconcile';
import { CardPanel } from '@/features/CardPanel';
import { ACCOUNT_TYPE_LABEL } from '@/features/txDisplay';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { useT } from '@/i18n';
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  IconButton,
  Screen,
  SectionTitle,
  T,
} from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

export default function Accounts() {
  const t = useT();
  const c = useTheme();
  const { money } = useMoney();
  const today = useToday();
  const view = useLive((db) => loadAccountsView(db, today), [today]);
  const groups = ACCOUNT_TYPES.map((type) => ({
    type,
    accounts: view.accounts.filter((a) => a.type === type),
  })).filter((g) => g.accounts.length > 0);

  const open = (a: Account) => router.push({ pathname: '/account/[id]', params: { id: a.id } });

  return (
    <Screen
      header={
        <Header
          title={t('tab.accounts')}
          right={
            <IconButton
              icon="plus"
              label={t('account.add')}
              onPress={() => router.push('/account-edit')}
            />
          }
        />
      }
    >
      {view.accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon="bank-plus"
            title={t('account.emptyTitle')}
            body={t('account.emptyBody')}
            action={
              <Button
                label={t('account.add')}
                icon="plus"
                onPress={() => router.push('/account-edit')}
              />
            }
          />
        </Card>
      ) : (
        <Card>
          <T variant="label" tone="muted">
            {t('account.netWorth')}
          </T>
          <T
            variant="display"
            numeric
            numberOfLines={1}
            adjustsFontSizeToFit
            tone={view.totals.netWorth < 0 ? 'danger' : 'default'}
            accessibilityLabel={`${t('account.netWorth')}: ${money(view.totals.netWorth)}`}
          >
            {money(view.totals.netWorth, { fraction: 'never' })}
          </T>
          <View
            style={{
              flexDirection: 'row',
              gap: space.md,
              marginTop: space.md,
              paddingTop: space.md,
              borderTopWidth: 1,
              borderTopColor: c.border,
            }}
          >
            {(
              [
                ['account.assets', view.totals.assets],
                ['account.cardsOwed', view.totals.cardOutstanding],
                ['account.available', view.totals.availableToSpend],
              ] as const
            ).map(([key, amount]) => (
              <View
                key={key}
                style={{ flex: 1 }}
                accessible
                accessibilityLabel={`${t(key)}: ${money(amount)}`}
              >
                <T variant="caption" tone="muted" numberOfLines={1}>
                  {t(key)}
                </T>
                <T variant="heading" numeric numberOfLines={1} adjustsFontSizeToFit>
                  {money(amount, { fraction: 'never' })}
                </T>
              </View>
            ))}
          </View>
        </Card>
      )}

      {groups.map((group) => {
        const subtotal = group.accounts.reduce(
          (sum, a) => sum + balanceToDisplay(a.type, view.balances.get(a.id) ?? a.openingBalance),
          0,
        );
        return (
          <View key={group.type} style={{ gap: space.sm }}>
            <SectionTitle
              action={
                <T variant="label" tone="muted" numeric>
                  {money(subtotal, { fraction: 'never' })}
                </T>
              }
            >
              {t(ACCOUNT_TYPE_LABEL[group.type])}
            </SectionTitle>
            <Card padded={false}>
              {group.accounts.map((account, index) => {
                const balance = view.balances.get(account.id) ?? account.openingBalance;
                const shown = balanceToDisplay(account.type, balance);
                const status = view.cards.get(account.id);
                const name = account.last4 ? `${account.name} ··${account.last4}` : account.name;
                return (
                  <View key={account.id}>
                    {index > 0 ? <Divider /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${name}, ${
                          account.type === 'credit_card'
                            ? t('card.outstanding')
                            : t('account.balance')
                        } ${money(shown)}`}
                        accessibilityHint={t('account.openHint')}
                        onPress={() => open(account)}
                        android_ripple={{ color: c.scrim }}
                        style={{
                          flex: 1,
                          minHeight: 64,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space.md,
                          paddingLeft: space.lg,
                          paddingVertical: space.sm,
                        }}
                      >
                        <Avatar icon={account.icon} color={account.color} />
                        <View style={{ flex: 1 }}>
                          <T style={{ fontWeight: '500' }} numberOfLines={1}>
                            {name}
                          </T>
                          {account.type === 'credit_card' ? (
                            <T variant="caption" tone="muted">
                              {t('card.outstanding')}
                            </T>
                          ) : null}
                        </View>
                        <T
                          numeric
                          style={{ fontWeight: '600' }}
                          tone={account.type !== 'credit_card' && shown < 0 ? 'danger' : 'default'}
                        >
                          {money(shown)}
                        </T>
                      </Pressable>
                      <IconButton
                        icon="scale-balance"
                        label={t('reconcile.actionFor', { name })}
                        color={c.textMuted}
                        onPress={() =>
                          router.push({ pathname: '/reconcile', params: { id: account.id } })
                        }
                      />
                    </View>
                    {status ? (
                      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
                        <CardPanel card={account} status={status} today={today} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}
