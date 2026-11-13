import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { getAccount, listCardStatements, saveCardStatement } from '@/data/accounts';
import { listEntriesForAccount } from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { cardStatus } from '@/domain/cards';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { Button, Card, EmptyState, Field, Header, Screen, T } from '@/ui/kit';

/** Lets the user type the minimum due and printed total for the latest statement. */
export default function Statement() {
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
      const statements = listCardStatements(db, id);
      const status = cardStatus(card, listEntriesForAccount(db, id), today, statements);
      return {
        card,
        status,
        computed: cardStatus(card, listEntriesForAccount(db, id), today, []).statementTotal,
        record: statements.find((s) => s.statementDate === status.statementDate) ?? null,
      };
    },
    [id, today],
  );
  const text = (value: number | null | undefined) =>
    value == null ? '' : toDecimalString(value, decimals).replace(/\.0+$/, '');
  const [minimum, setMinimum] = useState<string | null>(null);
  const [total, setTotal] = useState<string | null>(null);

  if (!data || !data.status.statementDate) {
    return (
      <Screen header={<Header back title={t('card.statementDetails')} />}>
        <EmptyState icon="file-document-outline" title={t('card.noCycle')} />
      </Screen>
    );
  }
  const { card, status, record, computed } = data;
  const statementDate = status.statementDate ?? today;
  const minimumText = minimum ?? text(record?.minimumDue);
  const totalText = total ?? text(record?.statedTotal);
  const minimumValue = minimumText.trim() === '' ? null : parseAmount(minimumText, decimals);
  const totalValue = totalText.trim() === '' ? null : parseAmount(totalText, decimals);
  const invalid =
    (minimumText.trim() !== '' && (minimumValue === null || minimumValue < 0)) ||
    (totalText.trim() !== '' && (totalValue === null || totalValue < 0));

  const save = () => {
    saveCardStatement(getDb(), {
      accountId: card.id,
      statementDate,
      minimumDue: minimumValue,
      statedTotal: totalValue,
    });
    showSnackbar(t('card.statementSaved'));
    router.back();
  };

  return (
    <Screen
      header={<Header back title={t('card.statementDetails')} subtitle={card.name} />}
      footer={<Button label={t('common.save')} icon="check" onPress={save} disabled={invalid} />}
    >
      <Card>
        <T variant="label" tone="muted">
          {t('card.statementOn', { date: dayLabel(t, statementDate) })}
        </T>
        <T variant="title" numeric>
          {money(computed)}
        </T>
        <T variant="caption" tone="muted">
          {t('card.computedTotalHint')}
        </T>
      </Card>
      <Field
        label={t('card.minDueLabel')}
        placeholder={t('common.optional')}
        keyboardType="decimal-pad"
        value={minimumText}
        onChangeText={setMinimum}
      />
      <Field
        label={t('card.statedTotalLabel')}
        hint={t('card.statedTotalHint')}
        placeholder={t('common.optional')}
        keyboardType="decimal-pad"
        value={totalText}
        onChangeText={setTotal}
      />
    </Screen>
  );
}
