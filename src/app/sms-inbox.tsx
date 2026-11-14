import { useState } from 'react';
import { View } from 'react-native';

import { loadLookups } from '@/data/queries';
import {
  acceptInboxItem,
  dismissDuplicates,
  dismissInboxItem,
  isBillPayment,
  listInbox,
  mapLast4,
  suggestedType,
  type InboxItem,
} from '@/data/sms';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import type { TransactionType } from '@/domain/types';
import { afterEntrySaved } from '@/features/afterSave';
import { TYPE_ICON, TYPE_LABEL } from '@/features/txDisplay';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { Button, Card, Chip, EmptyState, Header, Pill, Screen, T } from '@/ui/kit';
import { accountOptions, CategorySheet, OptionSheet } from '@/ui/Pickers';
import { space } from '@/ui/theme';

interface Choice {
  type?: TransactionType;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string | null;
}

const DEBIT_TYPES: TransactionType[] = ['expense', 'card_payment', 'transfer'];
const CREDIT_TYPES: TransactionType[] = ['income', 'refund', 'transfer', 'card_payment'];

/** Bank alerts waiting for review. Nothing here is in the ledger until the user adds it. */
export default function SmsInbox() {
  const t = useT();
  const today = useToday();
  const { money } = useMoney();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const data = useLive((db) => ({ items: listInbox(db), lookups: loadLookups(db) }));
  const { items, lookups } = data;
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [sheet, setSheet] = useState<{
    id: string;
    kind: 'account' | 'to' | 'category' | 'type';
  } | null>(null);
  const accounts = lookups.accounts.filter((a) => !a.archived);
  const flagged = items.filter((item) => item.possibleDuplicateOf !== null).length;

  const resolve = (item: InboxItem) => {
    const choice = choices[item.id] ?? {};
    const type = choice.type ?? suggestedType(item);
    const moves = type === 'transfer' || type === 'card_payment';
    // For money arriving (a credit), the alert's account is the destination of a transfer.
    const incomingMove = moves && item.direction === 'credit';
    const known = choice.accountId ?? item.accountId ?? undefined;
    return {
      type,
      moves,
      incomingMove,
      accountId: known,
      toAccountId: choice.toAccountId,
      categoryId: choice.categoryId !== undefined ? choice.categoryId : item.categoryId,
    };
  };

  const setChoice = (id: string, patch: Choice) =>
    setChoices((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const accept = (item: InboxItem) => {
    const r = resolve(item);
    if (!r.accountId || (r.moves && !r.toAccountId)) return;
    try {
      const tx = acceptInboxItem(getDb(), item.id, {
        type: r.type,
        accountId: r.incomingMove ? (r.toAccountId ?? r.accountId) : r.accountId,
        toAccountId: r.moves ? (r.incomingMove ? r.accountId : r.toAccountId) : null,
        categoryId: r.categoryId,
      });
      afterEntrySaved(tx, item.merchant ?? '');
      showSnackbar(t('sms.added'));
    } catch {
      showSnackbar(t('quick.saveFailed'));
    }
  };

  const active = sheet ? items.find((item) => item.id === sheet.id) : undefined;
  const activeResolved = active ? resolve(active) : undefined;

  return (
    <Screen
      header={
        <Header back title={t('sms.inbox')} subtitle={t('sms.pending', { count: items.length })} />
      }
    >
      <T tone="muted">{t('sms.inboxExplain')}</T>
      {flagged > 0 ? (
        <Button
          label={t('sms.dismissDuplicates', { count: flagged })}
          icon="content-duplicate"
          variant="secondary"
          onPress={() => {
            const n = dismissDuplicates(getDb());
            showSnackbar(t('sms.dismissedN', { count: n }));
          }}
        />
      ) : null}
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="inbox-outline"
            title={t('sms.inboxEmpty')}
            body={t('sms.inboxEmptyBody')}
          />
        </Card>
      ) : (
        items.map((item) => {
          const r = resolve(item);
          const account = r.accountId ? lookups.accountById.get(r.accountId) : undefined;
          const other = r.toAccountId ? lookups.accountById.get(r.toAccountId) : undefined;
          const category = r.categoryId ? lookups.categoryById.get(r.categoryId) : undefined;
          const ready = Boolean(r.accountId) && (!r.moves || Boolean(r.toAccountId));
          return (
            <Card key={item.id} style={{ gap: space.md }}>
              <View
                accessible
                accessibilityLabel={`${item.direction === 'debit' ? t('sms.debit') : t('sms.credit')} ${money(item.amount)}, ${item.merchant ?? ''}, ${dayLabel(t, item.day, today)}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="heading" numberOfLines={2}>
                    {item.merchant ??
                      (item.direction === 'debit' ? t('sms.debit') : t('sms.credit'))}
                  </T>
                  <T variant="caption" tone="muted">
                    {dayLabel(t, item.day, today)}
                    {item.sender ? ` · ${item.sender}` : ''}
                    {item.last4 ? ` · ··${item.last4}` : ''}
                  </T>
                </View>
                <T
                  variant="title"
                  numeric
                  tone={item.direction === 'credit' ? 'positive' : 'default'}
                >
                  {item.direction === 'credit' ? '+' : '−'}
                  {money(item.amount)}
                </T>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {item.possibleDuplicateOf ? (
                  <Pill tone="warning" icon="content-duplicate" label={t('sms.maybeDuplicate')} />
                ) : null}
                {isBillPayment(item) ? (
                  <Pill
                    tone="accent"
                    icon="credit-card-check-outline"
                    label={t('sms.looksLikeBill')}
                  />
                ) : null}
                {item.balance !== null ? (
                  <Pill
                    icon="scale-balance"
                    label={t('sms.balanceAfter', { amount: money(item.balance) })}
                  />
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Chip
                  icon={TYPE_ICON[r.type]}
                  label={t(TYPE_LABEL[r.type])}
                  accessibilityLabel={`${t('quick.type')}: ${t(TYPE_LABEL[r.type])}`}
                  onPress={() => setSheet({ id: item.id, kind: 'type' })}
                />
                <Chip
                  icon={account?.icon ?? 'bank-outline'}
                  iconColor={account?.color}
                  label={
                    account?.name ??
                    (item.last4
                      ? t('sms.whichAccount', { last4: item.last4 })
                      : t('quick.chooseAccount'))
                  }
                  highlight={!account}
                  accessibilityLabel={`${t('quick.account')}: ${account?.name ?? t('common.none')}`}
                  onPress={() => setSheet({ id: item.id, kind: 'account' })}
                />
                {r.moves ? (
                  <Chip
                    icon={other?.icon ?? 'swap-horizontal'}
                    iconColor={other?.color}
                    label={
                      other
                        ? `${r.incomingMove ? '←' : '→'} ${other.name}`
                        : r.incomingMove
                          ? t('sms.fromWhere')
                          : t('quick.chooseTo')
                    }
                    highlight={!other}
                    accessibilityLabel={`${r.incomingMove ? t('quick.from') : t('quick.to')}: ${other?.name ?? t('common.none')}`}
                    onPress={() => setSheet({ id: item.id, kind: 'to' })}
                  />
                ) : (
                  <Chip
                    icon={category?.icon ?? 'tag-outline'}
                    iconColor={category?.color}
                    label={category?.name ?? t('quick.category')}
                    highlight={!category}
                    accessibilityLabel={`${t('quick.category')}: ${category?.name ?? t('common.none')}`}
                    onPress={() => setSheet({ id: item.id, kind: 'category' })}
                  />
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label={t('sms.dismiss')}
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => dismissInboxItem(getDb(), item.id)}
                />
                <Button
                  label={t('sms.add')}
                  icon="check"
                  style={{ flex: 1 }}
                  disabled={!ready}
                  onPress={() => accept(item)}
                />
              </View>
            </Card>
          );
        })
      )}

      <OptionSheet<TransactionType>
        visible={sheet?.kind === 'type'}
        title={t('quick.type')}
        options={(active?.direction === 'credit' ? CREDIT_TYPES : DEBIT_TYPES).map((type) => ({
          value: type,
          label: t(TYPE_LABEL[type]),
          icon: TYPE_ICON[type],
        }))}
        value={activeResolved?.type}
        onClose={() => setSheet(null)}
        onSelect={(type) => active && setChoice(active.id, { type, toAccountId: undefined })}
      />
      <OptionSheet<string>
        visible={sheet?.kind === 'account'}
        title={active?.last4 ? t('sms.whichAccount', { last4: active.last4 }) : t('quick.account')}
        options={accountOptions(accounts)}
        value={activeResolved?.accountId}
        onClose={() => setSheet(null)}
        onSelect={(accountId) => {
          if (!active) return;
          setChoice(active.id, { accountId });
          // Mapped once: every other alert with these digits follows.
          if (active.last4) mapLast4(getDb(), active.last4, accountId);
        }}
      />
      <OptionSheet<string>
        visible={sheet?.kind === 'to'}
        title={activeResolved?.incomingMove ? t('quick.from') : t('quick.to')}
        options={accountOptions(
          accounts.filter(
            (a) =>
              a.id !== activeResolved?.accountId &&
              (activeResolved?.type !== 'card_payment' ||
                (activeResolved.incomingMove
                  ? a.type !== 'credit_card'
                  : a.type === 'credit_card')),
          ),
        )}
        value={activeResolved?.toAccountId}
        onClose={() => setSheet(null)}
        onSelect={(toAccountId) => active && setChoice(active.id, { toAccountId })}
      />
      <CategorySheet
        visible={sheet?.kind === 'category'}
        title={t('quick.category')}
        categories={lookups.categories.filter(
          (cat) =>
            !cat.archived &&
            cat.kind === (activeResolved?.type === 'income' ? 'income' : 'expense'),
        )}
        value={activeResolved?.categoryId ?? null}
        allowNone
        onClose={() => setSheet(null)}
        onSelect={(categoryId) => active && setChoice(active.id, { categoryId })}
      />
    </Screen>
  );
}
