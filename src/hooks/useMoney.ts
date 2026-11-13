import { useCallback } from 'react';

import { formatCompact, formatMoney, type FormatOptions, type Minor } from '@/domain/money';

import { useSettings } from './useSettings';

/** Formats money with the user's currency and number grouping. */
export function useMoney() {
  const { currency, grouping } = useSettings();
  const money = useCallback(
    (amount: Minor, options: FormatOptions = {}) =>
      formatMoney(amount, { currency, grouping, ...options }),
    [currency, grouping],
  );
  const compact = useCallback(
    (amount: Minor, options: FormatOptions = {}) =>
      formatCompact(amount, { currency, grouping, ...options }),
    [currency, grouping],
  );
  return { money, compact, currency, grouping };
}
