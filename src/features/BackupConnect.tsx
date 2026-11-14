import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { connectBackup } from '@/backup/service';
import { getDb } from '@/db/client';
import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { Button, Pill, T } from '@/ui/kit';
import { space } from '@/ui/theme';

/** Connect Google Drive from onboarding. Optional; nothing is contacted until the button is pressed. */
export function BackupConnect({ showManage }: { showManage?: boolean }) {
  const t = useT();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const connect = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await connectBackup(getDb());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (settings.backupEnabled) {
    return (
      <View style={{ gap: space.md }}>
        <Pill tone="positive" icon="cloud-check-outline" label={t('backup.on')} />
        <T tone="muted">{t('backup.account', { account: settings.backupAccount ?? '' })}</T>
        {showManage ? (
          <Button
            label={t('backup.title')}
            variant="secondary"
            onPress={() => router.push('/settings/backup')}
          />
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ gap: space.md }}>
      <T tone="muted">{t('backup.explain')}</T>
      <Button
        label={busy ? t('backup.working') : t('backup.connect')}
        icon="google-drive"
        variant="secondary"
        onPress={() => void connect()}
        disabled={busy}
      />
      {failed ? <T tone="danger">{t('backup.connectFailed')}</T> : null}
      <T variant="caption" tone="muted">
        {t('backup.later')}
      </T>
    </View>
  );
}
