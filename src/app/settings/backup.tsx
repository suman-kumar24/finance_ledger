import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { setAutoBackupScheduled } from '@/backup/background';
import type { DriveFile } from '@/backup/drive/client';
import { MIN_PASSPHRASE_LENGTH, WrongPassphraseError } from '@/backup/format/crypto';
import type { BackupFile } from '@/backup/format/snapshot';
import {
  applyBackup,
  backupNow,
  connectBackup,
  disconnectBackup,
  fetchBackup,
  listBackups,
  PassphraseNeededError,
  setBackupPassphrase,
} from '@/backup/service';
import { updateSettings } from '@/data/settings';
import { getDb } from '@/db/client';
import { dayFromTimestamp } from '@/domain/dates';
import { RestorePreview } from '@/features/RestorePreview';
import { useSettings } from '@/hooks/useSettings';
import { dayLabel, useT } from '@/i18n';
import { syncNotifications } from '@/notify';
import { useUi } from '@/state/ui';
import {
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Header,
  Pill,
  Row,
  Screen,
  SectionTitle,
  SwitchRow,
  T,
} from '@/ui/kit';
import { space } from '@/ui/theme';

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function BackupSettings() {
  const t = useT();
  const settings = useSettings();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [editingPassphrase, setEditingPassphrase] = useState(false);
  const [preview, setPreview] = useState<BackupFile | null>(null);
  const [locked, setLocked] = useState<DriveFile | null>(null);
  const [unlock, setUnlock] = useState('');

  const refresh = async () => {
    try {
      setFiles(await listBackups());
    } catch {
      setFiles([]);
      setError(t('backup.listFailed'));
    }
  };
  useEffect(() => {
    if (!settings.backupEnabled) return undefined;
    let current = true;
    // Loads the list when the screen opens or backup is switched on.
    listBackups()
      .then((list) => current && setFiles(list))
      .catch(() => {
        if (!current) return;
        setFiles([]);
        setError(t('backup.listFailed'));
      });
    return () => {
      current = false;
    };
  }, [settings.backupEnabled, t]);

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error && e.message ? `${t('backup.failed')} ${e.message}` : t('backup.failed'),
      );
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run('connect', async () => {
      const email = await connectBackup(getDb());
      if (email) {
        showSnackbar(t('backup.connected', { account: email }));
        void syncNotifications(getDb());
      }
    });

  const backup = () =>
    run('backup', async () => {
      await backupNow(getDb());
      showSnackbar(t('backup.done'));
      await refresh();
    });

  const open = (file: DriveFile, secret?: string) =>
    run('download', async () => {
      try {
        setPreview(await fetchBackup(file.id, secret));
        setLocked(null);
        setUnlock('');
      } catch (e) {
        if (e instanceof PassphraseNeededError) setLocked(file);
        else if (e instanceof WrongPassphraseError) {
          setLocked(file);
          setError(t('backup.wrongPassphrase'));
        } else throw e;
      }
    });

  const savePassphrase = () =>
    run('passphrase', async () => {
      await setBackupPassphrase(getDb(), passphrase);
      setPassphrase('');
      setRepeat('');
      setEditingPassphrase(false);
      showSnackbar(t('backup.encryptionOn'));
    });

  const disconnect = () =>
    Alert.alert(t('backup.disconnectTitle'), t('backup.disconnectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('backup.disconnect'),
        style: 'destructive',
        onPress: () =>
          void run('disconnect', async () => {
            await setAutoBackupScheduled(false);
            await disconnectBackup(getDb());
            setFiles(null);
            void syncNotifications(getDb());
          }),
      },
    ]);

  const passphraseOk = passphrase.length >= MIN_PASSPHRASE_LENGTH && passphrase === repeat;

  if (preview) {
    return (
      <Screen header={<Header title={t('backup.restoreTitle')} />}>
        <RestorePreview
          file={preview}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            applyBackup(getDb(), preview);
            setPreview(null);
            showSnackbar(t('backup.restored'));
            void syncNotifications(getDb());
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<Header back title={t('backup.title')} />}>
      {error ? <Banner tone="danger" icon="alert-circle-outline" title={error} /> : null}
      <Card style={{ gap: space.md }}>
        <Pill
          tone={settings.backupEnabled ? 'positive' : 'neutral'}
          icon={settings.backupEnabled ? 'cloud-check-outline' : 'cloud-off-outline'}
          label={settings.backupEnabled ? t('backup.on') : t('backup.off')}
        />
        <T tone="muted">{t('backup.explain')}</T>
        {settings.backupEnabled ? (
          <>
            <T variant="caption" tone="muted">
              {t('backup.account', { account: settings.backupAccount ?? '' })}
              {'\n'}
              {settings.lastBackupAt
                ? t('backup.last', {
                    date: dayLabel(t, dayFromTimestamp(settings.lastBackupAt)),
                    time: clock(settings.lastBackupAt),
                  })
                : t('backup.never')}
            </T>
            <Button
              label={busy === 'backup' ? t('backup.working') : t('backup.now')}
              icon="cloud-upload-outline"
              onPress={() => void backup()}
              disabled={busy !== null}
            />
          </>
        ) : (
          <Button
            label={busy === 'connect' ? t('backup.working') : t('backup.connect')}
            icon="google-drive"
            onPress={() => void connect()}
            disabled={busy !== null}
          />
        )}
      </Card>

      {settings.backupEnabled ? (
        <>
          <Card padded={false}>
            <SwitchRow
              icon="calendar-sync-outline"
              title={t('backup.auto')}
              subtitle={t('backup.autoSub')}
              value={settings.backupAuto}
              onChange={(value) => {
                updateSettings(getDb(), { backupAuto: value });
                void setAutoBackupScheduled(value);
              }}
            />
            <Divider />
            <Row
              icon={settings.backupEncrypted ? 'lock-outline' : 'lock-open-variant-outline'}
              title={settings.backupEncrypted ? t('backup.encrypted') : t('backup.notEncrypted')}
              subtitle={t('backup.encryptionSub')}
              onPress={() => setEditingPassphrase((v) => !v)}
            />
          </Card>

          {editingPassphrase ? (
            <Card style={{ gap: space.md }}>
              <T tone="muted">{t('backup.passphraseExplain')}</T>
              <Field
                label={t('backup.passphrase')}
                hint={t('backup.passphraseHint', { min: MIN_PASSPHRASE_LENGTH })}
                secureTextEntry
                autoCapitalize="none"
                value={passphrase}
                onChangeText={setPassphrase}
              />
              <Field
                label={t('backup.passphraseRepeat')}
                secureTextEntry
                autoCapitalize="none"
                value={repeat}
                onChangeText={setRepeat}
                error={
                  repeat !== '' && repeat !== passphrase ? t('backup.passphraseMismatch') : null
                }
              />
              <Button
                label={t('backup.setPassphrase')}
                icon="lock-outline"
                onPress={() => void savePassphrase()}
                disabled={!passphraseOk || busy !== null}
              />
              {settings.backupEncrypted ? (
                <Button
                  label={t('backup.removePassphrase')}
                  variant="ghost"
                  onPress={() =>
                    void run('passphrase', async () => {
                      await setBackupPassphrase(getDb(), null);
                      setEditingPassphrase(false);
                    })
                  }
                />
              ) : null}
            </Card>
          ) : null}

          <SectionTitle>{t('backup.restoreTitle')}</SectionTitle>
          {locked ? (
            <Card style={{ gap: space.md }}>
              <T>{t('backup.needPassphrase')}</T>
              <Field
                label={t('backup.passphrase')}
                secureTextEntry
                autoCapitalize="none"
                value={unlock}
                onChangeText={setUnlock}
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => setLocked(null)}
                />
                <Button
                  label={t('backup.open')}
                  style={{ flex: 1 }}
                  disabled={unlock === '' || busy !== null}
                  onPress={() => void open(locked, unlock)}
                />
              </View>
            </Card>
          ) : null}
          <Card padded={false}>
            {files === null ? (
              <EmptyState icon="cloud-sync-outline" title={t('backup.working')} />
            ) : files.length === 0 ? (
              <EmptyState
                icon="cloud-outline"
                title={t('backup.none')}
                body={t('backup.noneBody')}
              />
            ) : (
              files.map((file, index) => (
                <View key={file.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    icon="file-restore-outline"
                    title={`${dayLabel(t, dayFromTimestamp(file.createdTime))}, ${clock(file.createdTime)}`}
                    subtitle={t('backup.size', { kb: Math.max(1, Math.round(file.size / 1024)) })}
                    accessibilityHint={t('backup.restoreHint')}
                    onPress={busy === null ? () => void open(file) : undefined}
                  />
                </View>
              ))
            )}
          </Card>
          <T variant="caption" tone="muted">
            {t('backup.keeps')}
          </T>
          <Button
            label={t('backup.disconnect')}
            variant="ghost"
            onPress={disconnect}
            disabled={busy !== null}
          />
        </>
      ) : null}
    </Screen>
  );
}
