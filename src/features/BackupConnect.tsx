import { useT } from '@/i18n';
import { T } from '@/ui/kit';

/** Google Drive connection; wired up with backup in Phase 8. */
export function BackupConnect(_props: { onConnected?: () => void }) {
  const t = useT();
  return <T tone="muted">{t('backup.later')}</T>;
}
