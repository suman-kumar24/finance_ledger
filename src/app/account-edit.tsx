import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import {
  AccountInUseError,
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  setAccountArchived,
  updateAccount,
} from '@/data/accounts';
import { getDb } from '@/db/client';
import { currencyInfo } from '@/domain/money';
import {
  accountFormFrom,
  accountFormProblems,
  accountFormToInput,
  AccountFormFields,
  emptyAccountForm,
} from '@/features/AccountForm';
import { useSettings } from '@/hooks/useSettings';
import { useToday } from '@/hooks/useToday';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { Button, Header, Screen } from '@/ui/kit';

export default function AccountEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useT();
  const today = useToday();
  const { currency } = useSettings();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const existing = useMemo(() => (id ? getAccount(getDb(), id) : null), [id]);
  const decimals = currencyInfo(existing?.currency ?? currency).decimals;
  const [state, setState] = useState(() =>
    existing
      ? accountFormFrom(existing, decimals)
      : emptyAccountForm(today, 'bank', listAccounts(getDb(), { includeArchived: true }).length),
  );
  const [showErrors, setShowErrors] = useState(false);

  const save = () => {
    if (accountFormProblems(state, decimals).length > 0) {
      setShowErrors(true);
      return;
    }
    const input = accountFormToInput(state, existing?.currency ?? currency);
    if (existing) updateAccount(getDb(), existing.id, input);
    else createAccount(getDb(), input);
    showSnackbar(t('account.saved'));
    router.back();
  };

  const archive = () => {
    if (!existing) return;
    setAccountArchived(getDb(), existing.id, !existing.archived);
    showSnackbar(existing.archived ? t('account.restored') : t('account.archived'));
    router.dismissTo('/(tabs)/accounts');
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody', { name: existing.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          try {
            deleteAccount(getDb(), existing.id);
            showSnackbar(t('account.deleted'));
            router.dismissTo('/(tabs)/accounts');
          } catch (e) {
            if (e instanceof AccountInUseError) {
              // An account with history cannot be deleted; offer to archive instead.
              Alert.alert(
                t('account.inUseTitle'),
                t('account.inUseBody', { count: e.usage.transactions + e.usage.rules }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('account.archiveInstead'), onPress: archive },
                ],
              );
            } else throw e;
          }
        },
      },
    ]);
  };

  return (
    <Screen
      header={<Header back title={existing ? t('account.edit') : t('account.add')} />}
      footer={<Button label={t('common.save')} icon="check" onPress={save} />}
    >
      <AccountFormFields
        state={state}
        onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
        today={today}
        currency={existing?.currency ?? currency}
        showErrors={showErrors}
      />
      {existing ? (
        <>
          <Button
            label={existing.archived ? t('account.restore') : t('account.archive')}
            icon={existing.archived ? 'archive-arrow-up-outline' : 'archive-arrow-down-outline'}
            variant="secondary"
            onPress={archive}
            accessibilityHint={t('account.archiveHint')}
          />
          <Button
            label={t('account.delete')}
            icon="trash-can-outline"
            variant="ghost"
            onPress={remove}
          />
        </>
      ) : null}
    </Screen>
  );
}
