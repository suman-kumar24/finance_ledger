import { useState } from 'react';
import { View } from 'react-native';

import { updateSettings, type Language, type ThemeChoice } from '@/data/settings';
import { currentPeriodKey } from '@/data/queries';
import { getDb } from '@/db/client';
import { CURRENCIES, formatMoney, type Grouping } from '@/domain/money';
import { periodFromKey } from '@/domain/months';
import { useSettings } from '@/hooks/useSettings';
import { useToday } from '@/hooks/useToday';
import { dayLabel, useT } from '@/i18n';
import { Card, Chip, Field, Header, Screen, SectionTitle, Segmented, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function General() {
  const t = useT();
  const today = useToday();
  const settings = useSettings();
  const [startDay, setStartDay] = useState(String(settings.monthStartDay));
  const set = (patch: Parameters<typeof updateSettings>[1]) => updateSettings(getDb(), patch);
  const period = periodFromKey(currentPeriodKey(settings, today), settings.monthStartDay);

  return (
    <Screen header={<Header back title={t('settings.general')} />}>
      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Segmented<Language>
        label={t('settings.language')}
        value={settings.language}
        onChange={(language) => set({ language })}
        options={[
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिन्दी' },
        ]}
      />

      <SectionTitle>{t('settings.currency')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {Object.values(CURRENCIES).map((cur) => (
          <Chip
            key={cur.code}
            label={`${cur.symbol.trim()} ${cur.code}`}
            accessibilityLabel={cur.name}
            selected={settings.currency === cur.code}
            onPress={() => set({ currency: cur.code })}
          />
        ))}
      </View>
      <T variant="caption" tone="muted">
        {t('settings.currencyNote')}
      </T>

      <SectionTitle>{t('settings.numberFormat')}</SectionTitle>
      <Segmented<Grouping>
        label={t('settings.numberFormat')}
        value={settings.grouping}
        onChange={(grouping) => set({ grouping })}
        options={[
          { value: 'indian', label: '1,00,000' },
          { value: 'western', label: '100,000' },
        ]}
      />
      <Card>
        <T variant="caption" tone="muted">
          {t('onb.example')}
        </T>
        <T variant="title" numeric>
          {formatMoney(12345678_50, { currency: settings.currency, grouping: settings.grouping })}
        </T>
      </Card>

      <SectionTitle>{t('settings.monthStart')}</SectionTitle>
      <Field
        label={t('settings.monthStartLabel')}
        hint={t('settings.monthStartHint')}
        keyboardType="number-pad"
        maxLength={2}
        value={startDay}
        onChangeText={(value) => {
          setStartDay(value);
          const n = Number(value);
          if (Number.isInteger(n) && n >= 1 && n <= 31) set({ monthStartDay: n });
        }}
      />
      <T variant="caption" tone="muted">
        {t('onb.thisMonthRuns')} {dayLabel(t, period.start)} – {dayLabel(t, period.end)}
      </T>

      <SectionTitle>{t('settings.theme')}</SectionTitle>
      <Segmented<ThemeChoice>
        label={t('settings.theme')}
        value={settings.theme}
        onChange={(theme) => set({ theme })}
        options={[
          { value: 'system', label: t('settings.themeSystem'), icon: 'theme-light-dark' },
          { value: 'light', label: t('settings.themeLight'), icon: 'white-balance-sunny' },
          { value: 'dark', label: t('settings.themeDark'), icon: 'weather-night' },
        ]}
      />
    </Screen>
  );
}
