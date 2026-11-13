import { View } from 'react-native';

import { shiftPeriodKey, type Period } from '@/domain/months';
import { dayLabel, periodLabel, useT } from '@/i18n';

import { IconButton, T } from './kit';

/** "‹ November 2025 ›" with the period's dates when it is not a calendar month. */
export function MonthSwitcher({
  period,
  currentKey,
  onChange,
  showRange,
}: {
  period: Period;
  currentKey: string;
  onChange: (key: string) => void;
  showRange: boolean;
}) {
  const t = useT();
  const label = periodLabel(t, period.key);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        icon="chevron-left"
        label={t('common.previousMonth')}
        onPress={() => onChange(shiftPeriodKey(period.key, -1))}
      />
      <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLiveRegion="polite">
        <T variant="heading">{label}</T>
        {showRange ? (
          <T variant="caption" tone="muted">
            {dayLabel(t, period.start)} – {dayLabel(t, period.end)}
          </T>
        ) : null}
      </View>
      <IconButton
        icon="chevron-right"
        label={t('common.nextMonth')}
        disabled={period.key >= currentKey}
        onPress={() => onChange(shiftPeriodKey(period.key, 1))}
      />
    </View>
  );
}
