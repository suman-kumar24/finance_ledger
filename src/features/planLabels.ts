import type { Priority, PurchaseStatus } from '@/domain/types';
import type { StringKey } from '@/i18n';
import type { PillTone } from '@/ui/kit';

export const PURCHASE_STATUS: Record<
  PurchaseStatus,
  { key: StringKey; icon: string; tone: PillTone }
> = {
  thinking: { key: 'purchase.thinking', icon: 'thought-bubble-outline', tone: 'neutral' },
  saving: { key: 'purchase.saving', icon: 'piggy-bank-outline', tone: 'accent' },
  bought: { key: 'purchase.bought', icon: 'check-circle-outline', tone: 'positive' },
};
export const PRIORITY_LABEL: Record<Priority, StringKey> = {
  high: 'purchase.high',
  medium: 'purchase.medium',
  low: 'purchase.low',
};
