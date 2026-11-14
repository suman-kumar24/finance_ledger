import { View } from 'react-native';

import type { BackupFile } from '@/backup/format/snapshot';
import { dayFromTimestamp } from '@/domain/dates';
import { dayLabel, useT, type StringKey } from '@/i18n';
import { Banner, Button, Card, Divider, T } from '@/ui/kit';
import { space } from '@/ui/theme';

const COUNT_LABELS: [keyof BackupFile['counts'], StringKey][] = [
  ['accounts', 'tab.accounts'],
  ['transactions', 'tab.transactions'],
  ['categories', 'settings.categories'],
  ['budgets', 'settings.budgets'],
  ['recurringRules', 'settings.recurring'],
  ['goals', 'goal.title'],
  ['plannedPurchases', 'purchase.title'],
];

/** Shows a backup's date and what it contains before anything is replaced. */
export function RestorePreview({
  file,
  onConfirm,
  onCancel,
}: {
  file: BackupFile;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const made = new Date(file.createdAt);
  const time = `${String(made.getHours()).padStart(2, '0')}:${String(made.getMinutes()).padStart(2, '0')}`;
  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <T variant="label" tone="muted">
          {t('backup.madeOn')}
        </T>
        <T variant="title">
          {dayLabel(t, dayFromTimestamp(file.createdAt))}, {time}
        </T>
      </Card>
      <Card padded={false}>
        {COUNT_LABELS.map(([key, label], index) => (
          <View key={key}>
            {index > 0 ? <Divider /> : null}
            <View
              accessible
              accessibilityLabel={`${t(label)}: ${file.counts[key]}`}
              style={{ flexDirection: 'row', padding: space.lg }}
            >
              <T style={{ flex: 1 }}>{t(label)}</T>
              <T numeric style={{ fontWeight: '600' }}>
                {file.counts[key]}
              </T>
            </View>
          </View>
        ))}
      </Card>
      <Banner
        tone="warning"
        icon="alert-outline"
        title={t('backup.replaceWarning')}
        body={t('backup.replaceBody')}
      />
      <Button
        label={t('backup.restoreConfirm')}
        icon="backup-restore"
        variant="danger"
        onPress={onConfirm}
      />
      <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} />
    </View>
  );
}
