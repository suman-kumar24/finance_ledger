import { useState } from 'react';
import { View } from 'react-native';

import { WrongPassphraseError } from '@/backup/format/crypto';
import { backupFileName, SnapshotError, type BackupFile } from '@/backup/format/snapshot';
import { applyBackup, appVersion, PassphraseNeededError, readBackupText } from '@/backup/service';
import {
  detectDateOrder,
  detectDelimiter,
  guessMapping,
  IMPORT_FIELDS,
  mapRows,
  parseCsv,
  transactionsToCsv,
  type ColumnMapping,
  type ImportField,
} from '@/csv';
import { exportSnapshot } from '@/data/backup';
import { saveImportedRows } from '@/data/importCsv';
import { loadLookups } from '@/data/queries';
import { updateSettings } from '@/data/settings';
import { countTransactions, isFilterActive, listAllTransactions } from '@/data/transactions';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { currencyInfo } from '@/domain/money';
import { pickTextFile, shareTextFile } from '@/features/files';
import { RestorePreview } from '@/features/RestorePreview';
import { TYPE_LABEL } from '@/features/txDisplay';
import { useMoney } from '@/hooks/useMoney';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT, type StringKey } from '@/i18n';
import { syncNotifications } from '@/notify';
import { useUi } from '@/state/ui';
import {
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  Field,
  Header,
  Row,
  Screen,
  SectionTitle,
  T,
} from '@/ui/kit';
import { accountOptions, OptionSheet } from '@/ui/Pickers';
import { space } from '@/ui/theme';

const FIELD_LABEL: Record<ImportField, StringKey> = {
  date: 'import.fieldDate',
  amount: 'import.fieldAmount',
  debit: 'import.fieldDebit',
  credit: 'import.fieldCredit',
  type: 'import.fieldType',
  account: 'import.fieldAccount',
  toAccount: 'import.fieldToAccount',
  category: 'import.fieldCategory',
  payee: 'import.fieldPayee',
  note: 'import.fieldNote',
  method: 'import.fieldMethod',
  tags: 'import.fieldTags',
};

interface CsvState {
  name: string;
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  accountId: string | null;
}

/** "20251113-142210", for file names. */
function stampNow(): string {
  return backupFileName(Date.now()).replace('ledger-backup-', '').replace('.json', '');
}

function markExported(): void {
  updateSettings(getDb(), { lastExportAt: Date.now() });
}

export default function ExportImport() {
  const t = useT();
  const today = useToday();
  const { money, currency } = useMoney();
  const decimals = currencyInfo(currency).decimals;
  const filter = useUi((s) => s.filter);
  const showSnackbar = useUi((s) => s.showSnackbar);
  const data = useLive(
    (db) => ({
      lookups: loadLookups(db),
      total: countTransactions(db),
      filtered: countTransactions(db, filter),
    }),
    [JSON.stringify(filter)],
  );
  const { lookups } = data;
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState<CsvState | null>(null);
  const [picking, setPicking] = useState<ImportField | 'account' | null>(null);
  const [restore, setRestore] = useState<BackupFile | null>(null);
  const [encrypted, setEncrypted] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');

  const context = {
    accounts: lookups.accountById,
    categories: lookups.categoryById,
    decimals,
    currency,
  };

  const exportCsv = async (onlyFiltered: boolean) => {
    setError(null);
    try {
      const rows = listAllTransactions(getDb(), onlyFiltered ? filter : {});
      const ok = await shareTextFile(
        `ledger-transactions-${stampNow()}.csv`,
        transactionsToCsv(rows, context),
        'text/csv',
      );
      if (ok) markExported();
      void syncNotifications(getDb());
    } catch {
      setError(t('export.failed'));
    }
  };

  const exportJson = async () => {
    setError(null);
    try {
      const text = JSON.stringify(exportSnapshot(getDb(), appVersion()), null, 1);
      const ok = await shareTextFile(`ledger-export-${stampNow()}.json`, text, 'application/json');
      if (ok) markExported();
      void syncNotifications(getDb());
    } catch {
      setError(t('export.failed'));
    }
  };

  const pickCsv = async () => {
    setError(null);
    try {
      const file = await pickTextFile([
        'text/csv',
        'text/comma-separated-values',
        'text/plain',
        '*/*',
      ]);
      if (!file) return;
      const table = parseCsv(file.text, detectDelimiter(file.text));
      const [headers, ...rows] = table;
      if (!headers || rows.length === 0) {
        setError(t('import.empty'));
        return;
      }
      const first =
        lookups.accounts.find((a) => !a.archived && a.type === 'bank') ??
        lookups.accounts.find((a) => !a.archived);
      setCsv({
        name: file.name,
        headers,
        rows,
        mapping: guessMapping(headers),
        accountId: first?.id ?? null,
      });
    } catch {
      setError(t('import.unreadable'));
    }
  };

  const openBackup = async (text: string, secret?: string) => {
    try {
      setRestore(await readBackupText(text, secret));
      setEncrypted(null);
      setPassphrase('');
    } catch (e) {
      if (e instanceof PassphraseNeededError) setEncrypted(text);
      else if (e instanceof WrongPassphraseError) {
        setEncrypted(text);
        setError(t('backup.wrongPassphrase'));
      } else if (e instanceof SnapshotError && e.problem === 'newer_version')
        setError(t('restore.newer'));
      else setError(t('restore.notBackup'));
    }
  };

  const pickJson = async () => {
    setError(null);
    try {
      const file = await pickTextFile(['application/json', 'text/plain', '*/*']);
      if (file) await openBackup(file.text);
    } catch {
      setError(t('import.unreadable'));
    }
  };

  if (restore) {
    return (
      <Screen header={<Header title={t('backup.restoreTitle')} />}>
        <RestorePreview
          file={restore}
          onCancel={() => setRestore(null)}
          onConfirm={() => {
            applyBackup(getDb(), restore);
            setRestore(null);
            showSnackbar(t('backup.restored'));
            void syncNotifications(getDb());
          }}
        />
      </Screen>
    );
  }

  if (csv) {
    const dateColumn = csv.mapping.date;
    const result = mapRows(csv.rows, csv.mapping, {
      accountsByName: new Map(lookups.accounts.map((a) => [a.name.toLowerCase(), a.id])),
      categoriesByName: new Map(
        lookups.categories.map((cat) => [cat.name.toLowerCase(), { id: cat.id, kind: cat.kind }]),
      ),
      defaultAccountId: csv.accountId,
      decimals,
      dateOrder: detectDateOrder(
        dateColumn === null ? [] : csv.rows.map((r) => r[dateColumn] ?? ''),
      ),
      today,
    });
    const account = csv.accountId ? lookups.accountById.get(csv.accountId) : undefined;
    const columnOptions = [
      { value: -1, label: t('import.noColumn') },
      ...csv.headers.map((h, i) => ({
        value: i,
        label: h || t('import.columnN', { n: i + 1 }),
        subtitle: csv.rows[0]?.[i],
      })),
    ];
    const runImport = () => {
      const outcome = saveImportedRows(getDb(), result.drafts, today);
      showSnackbar(t('import.done', { count: outcome.saved }));
      setCsv(null);
      void syncNotifications(getDb());
    };
    return (
      <Screen
        header={<Header title={t('import.title')} subtitle={csv.name} />}
        footer={
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              label={t('common.cancel')}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => setCsv(null)}
            />
            <Button
              label={t('import.importN', { count: result.drafts.length })}
              icon="database-import-outline"
              style={{ flex: 2 }}
              disabled={result.drafts.length === 0}
              onPress={runImport}
            />
          </View>
        }
      >
        <SectionTitle>{t('import.columns')}</SectionTitle>
        <T tone="muted">{t('import.columnsHelp')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {IMPORT_FIELDS.map((field) => {
            const index = csv.mapping[field];
            const column =
              index === null ? null : (csv.headers[index] ?? t('import.columnN', { n: index + 1 }));
            return (
              <Chip
                key={field}
                label={`${t(FIELD_LABEL[field])}: ${column ?? '—'}`}
                selected={index !== null}
                accessibilityLabel={`${t(FIELD_LABEL[field])}: ${column ?? t('import.noColumn')}`}
                onPress={() => setPicking(field)}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Chip
            icon={account?.icon ?? 'bank-outline'}
            iconColor={account?.color}
            label={t('import.defaultAccount', { name: account?.name ?? '—' })}
            highlight={!account}
            onPress={() => setPicking('account')}
          />
        </View>

        <SectionTitle>{t('import.preview')}</SectionTitle>
        <Card padded={false}>
          <Row
            icon="check-circle-outline"
            title={t('import.ready', { count: result.drafts.length })}
            right={<View />}
          />
          {result.skipped.length > 0 ? (
            <>
              <Divider />
              <Row
                icon="alert-outline"
                title={t('import.skipped', { count: result.skipped.length })}
                subtitle={t('import.skippedLines', {
                  lines: result.skipped
                    .slice(0, 8)
                    .map((s) => s.line + 1)
                    .join(', '),
                })}
                right={<View />}
              />
            </>
          ) : null}
          {result.unknownCategories.length > 0 ? (
            <>
              <Divider />
              <Row
                icon="tag-off-outline"
                title={t('import.unknownCategories', { count: result.unknownCategories.length })}
                subtitle={result.unknownCategories.slice(0, 6).join(', ')}
                right={<View />}
              />
            </>
          ) : null}
        </Card>
        <Card padded={false}>
          {result.drafts.slice(0, 6).map((draft, index) => (
            <View key={draft.line}>
              {index > 0 ? <Divider /> : null}
              <View
                accessible
                accessibilityLabel={`${dayLabel(t, draft.day)}, ${t(TYPE_LABEL[draft.type])}, ${money(draft.amount)}, ${draft.payee ?? ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.lg,
                }}
              >
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '500' }} numberOfLines={1}>
                    {draft.payee ?? t(TYPE_LABEL[draft.type])}
                  </T>
                  <T variant="caption" tone="muted" numberOfLines={1}>
                    {dayLabel(t, draft.day)} · {t(TYPE_LABEL[draft.type])} ·{' '}
                    {lookups.accountById.get(draft.accountId)?.name ?? ''}
                    {draft.categoryId
                      ? ` · ${lookups.categoryById.get(draft.categoryId)?.name ?? ''}`
                      : ''}
                  </T>
                </View>
                <T numeric style={{ fontWeight: '600' }}>
                  {money(Math.abs(draft.amount))}
                </T>
              </View>
            </View>
          ))}
        </Card>

        <OptionSheet<number>
          visible={picking !== null && picking !== 'account'}
          title={picking && picking !== 'account' ? t(FIELD_LABEL[picking]) : ''}
          options={columnOptions}
          value={picking && picking !== 'account' ? (csv.mapping[picking] ?? -1) : -1}
          onClose={() => setPicking(null)}
          onSelect={(index) => {
            if (picking && picking !== 'account') {
              setCsv({ ...csv, mapping: { ...csv.mapping, [picking]: index < 0 ? null : index } });
            }
          }}
        />
        <OptionSheet<string>
          visible={picking === 'account'}
          title={t('quick.account')}
          options={accountOptions(lookups.accounts.filter((a) => !a.archived))}
          value={csv.accountId ?? undefined}
          onClose={() => setPicking(null)}
          onSelect={(accountId) => setCsv({ ...csv, accountId })}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<Header back title={t('export.title')} />}>
      {error ? <Banner tone="danger" icon="alert-circle-outline" title={error} /> : null}
      <SectionTitle>{t('export.section')}</SectionTitle>
      <Card padded={false}>
        <Row
          icon="file-delimited-outline"
          title={t('export.csvAll')}
          subtitle={t('tx.count', { count: data.total })}
          onPress={() => void exportCsv(false)}
        />
        {isFilterActive(filter) ? (
          <>
            <Divider />
            <Row
              icon="filter-outline"
              title={t('export.csvFiltered')}
              subtitle={t('tx.count', { count: data.filtered })}
              onPress={() => void exportCsv(true)}
            />
          </>
        ) : null}
        <Divider />
        <Row
          icon="code-json"
          title={t('export.json')}
          subtitle={t('export.jsonSub')}
          onPress={() => void exportJson()}
        />
      </Card>
      <T variant="caption" tone="muted">
        {isFilterActive(filter)
          ? t('export.shareNote')
          : `${t('export.shareNote')} ${t('export.filterTip')}`}
      </T>

      <SectionTitle>{t('import.section')}</SectionTitle>
      <Card padded={false}>
        <Row
          icon="database-import-outline"
          title={t('import.csv')}
          subtitle={t('import.csvSub')}
          onPress={() => void pickCsv()}
        />
        <Divider />
        <Row
          icon="backup-restore"
          title={t('restore.fromFile')}
          subtitle={t('restore.fromFileSub')}
          onPress={() => void pickJson()}
        />
      </Card>

      {encrypted ? (
        <Card style={{ gap: space.md }}>
          <T>{t('backup.needPassphrase')}</T>
          <Field
            label={t('backup.passphrase')}
            secureTextEntry
            autoCapitalize="none"
            value={passphrase}
            onChangeText={setPassphrase}
          />
          <Button
            label={t('backup.open')}
            disabled={passphrase === ''}
            onPress={() => {
              setError(null);
              void openBackup(encrypted, passphrase);
            }}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
