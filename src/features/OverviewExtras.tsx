import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { listAccounts, listCardStatements } from '@/data/accounts';
import type { PeriodView } from '@/data/queries';
import { listRecurringRules, recordOccurrence, skipOccurrence } from '@/data/recurring';
import { countInbox } from '@/data/sms';
import { listEntriesForAccount, listScheduled } from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { cardStatus } from '@/domain/cards';
import { addDays, diffDays } from '@/domain/dates';
import { upcoming, UPCOMING_DAYS, type UpcomingItem } from '@/domain/upcoming';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { syncNotifications } from '@/notify';
import { useUi } from '@/state/ui';
import { Banner, Card, Divider, Icon, Pill, SectionTitle, T } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

const KIND_ICON: Record<UpcomingItem['kind'], string> = {
  card_bill: 'credit-card-clock-outline',
  recurring: 'repeat',
  scheduled: 'clock-outline',
};

/** Warning banners and the "Coming up" list. Only shown for the current month. */
export function OverviewExtras({ view, isCurrent }: { view: PeriodView; isCurrent: boolean }) {
  const t = useT();
  const c = useTheme();
  const { money } = useMoney();
  const today = useToday();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const data = useLive(
    (db) => {
      const statements = listCardStatements(db);
      const cards = listAccounts(db)
        .filter((a) => a.type === 'credit_card')
        .map((account) => ({
          account,
          status: cardStatus(account, listEntriesForAccount(db, account.id), today, statements),
        }));
      return {
        cards,
        smsPending: countInbox(db),
        items: upcoming({
          today,
          cards,
          rules: listRecurringRules(db),
          scheduled: listScheduled(db, addDays(today, UPCOMING_DAYS)),
          scheduledTitle: t('tx.scheduled'),
        }),
      };
    },
    [today, t('tx.scheduled')],
  );
  if (!isCurrent) return null;

  const over = view.budgets.filter((b) => b.state === 'over');
  const near = view.budgets.filter((b) => b.state === 'warning');
  const bills = data.cards.filter(
    ({ status }) =>
      status.billState === 'overdue' ||
      status.billState === 'due_today' ||
      status.billState === 'due_soon',
  );

  const when = (item: UpcomingItem) => {
    const days = diffDays(today, item.day);
    if (days < 0) return t('upcoming.overdueBy', { days: -days });
    if (days === 0) return t('common.today');
    if (days === 1) return t('upcoming.tomorrow');
    return `${dayLabel(t, item.day, today)} · ${t('upcoming.inDays', { days })}`;
  };

  const act = (item: UpcomingItem) => {
    if (item.kind === 'card_bill') {
      router.push({ pathname: '/pay-bill', params: { id: item.refId } });
    } else if (item.kind === 'scheduled') {
      router.push({ pathname: '/quick-add', params: { id: item.refId } });
    } else {
      Alert.alert(item.title, t('upcoming.recurringPrompt', { amount: money(item.amount) }), [
        {
          text: t('upcoming.recordNow'),
          onPress: () => {
            try {
              recordOccurrence(getDb(), item.refId, today);
              showSnackbar(t('quick.saved'));
              void syncNotifications(getDb());
            } catch {
              showSnackbar(t('quick.saveFailed'));
            }
          },
        },
        {
          text: t('upcoming.skipOnce'),
          onPress: () => {
            skipOccurrence(getDb(), item.refId);
            void syncNotifications(getDb());
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
  };

  return (
    <>
      {data.smsPending > 0 ? (
        <Banner
          tone="accent"
          icon="inbox-arrow-down-outline"
          title={t('sms.pending', { count: data.smsPending })}
          actionLabel={t('sms.review')}
          onAction={() => router.push('/sms-inbox')}
        />
      ) : null}
      {over.map((b) => (
        <Banner
          key={`over-${b.budgetId}`}
          tone="danger"
          icon="alert-octagon-outline"
          title={t('banner.budgetOver', { name: b.name })}
          body={t('banner.budgetOverBody', { amount: money(-b.remaining, { fraction: 'never' }) })}
        />
      ))}
      {near.map((b) => (
        <Banner
          key={`near-${b.budgetId}`}
          tone="warning"
          icon="alert-outline"
          title={t('banner.budgetNear', { name: b.name, percent: b.percent })}
          body={t('banner.budgetNearBody', { amount: money(b.remaining, { fraction: 'never' }) })}
        />
      ))}
      {bills.map(({ account, status }) => (
        <Banner
          key={`bill-${account.id}`}
          tone={status.billState === 'overdue' ? 'danger' : 'warning'}
          icon="credit-card-clock-outline"
          title={
            status.billState === 'overdue'
              ? t('banner.billOverdue', { name: account.name })
              : status.billState === 'due_today'
                ? t('banner.billToday', { name: account.name })
                : t('banner.billSoon', { name: account.name, days: status.daysUntilDue ?? 0 })
          }
          body={money(status.currentBill)}
          actionLabel={t('card.payBill')}
          onAction={() => router.push({ pathname: '/pay-bill', params: { id: account.id } })}
        />
      ))}

      {data.items.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionTitle>{t('upcoming.title')}</SectionTitle>
          <Card padded={false}>
            {data.items.map((item, index) => (
              <View key={item.key}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${money(item.amount)}, ${when(item)}`}
                  accessibilityHint={t('upcoming.hint')}
                  onPress={() => act(item)}
                  android_ripple={{ color: c.scrim }}
                  style={{
                    minHeight: 64,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingHorizontal: space.lg,
                    paddingVertical: space.sm,
                  }}
                >
                  <Icon name={KIND_ICON[item.kind]} color={item.overdue ? c.danger : c.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T style={{ fontWeight: '500' }} numberOfLines={1}>
                      {item.title}
                    </T>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.sm,
                        flexWrap: 'wrap',
                      }}
                    >
                      {item.overdue ? (
                        <Pill tone="danger" icon="alert-octagon-outline" label={when(item)} />
                      ) : (
                        <T variant="caption" tone="muted">
                          {when(item)}
                        </T>
                      )}
                      {item.kind === 'recurring' && item.auto ? (
                        <T variant="caption" tone="muted">
                          {t('upcoming.auto')}
                        </T>
                      ) : null}
                    </View>
                  </View>
                  <T
                    numeric
                    style={{ fontWeight: '600' }}
                    tone={item.incoming ? 'positive' : 'default'}
                  >
                    {item.incoming ? '+' : ''}
                    {money(item.amount)}
                  </T>
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}
