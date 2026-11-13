import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import {
  addDays,
  daysInMonth,
  normalizeMonth,
  parseDay,
  toDay,
  weekday,
  type Day,
} from '@/domain/dates';
import { monthName, useT } from '@/i18n';

import { Button, Chip, IconButton, T } from './kit';
import { radius, space, useTheme } from './theme';

/** A small calendar in a dialog. Works with TalkBack: every day is a labelled button. */
export function DayPicker({
  visible,
  value,
  today,
  onSelect,
  onClose,
  minDay,
}: {
  visible: boolean;
  value: Day;
  today: Day;
  onSelect: (day: Day) => void;
  onClose: () => void;
  minDay?: Day;
}) {
  const c = useTheme();
  const t = useT();
  const initial = parseDay(value);
  const [cursor, setCursor] = useState({ year: initial.year, month: initial.month });

  const first = toDay(cursor.year, cursor.month, 1);
  const offset = weekday(first);
  const total = daysInMonth(cursor.year, cursor.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  const move = (delta: number) => setCursor(normalizeMonth(cursor.year, cursor.month + delta));
  const pick = (day: Day) => {
    onSelect(day);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'center', padding: space.xl }}
        onPress={onClose}
        accessibilityLabel={t('common.close')}
      >
        <Pressable
          onPress={() => undefined}
          accessible={false}
          style={{
            backgroundColor: c.surface,
            borderRadius: radius.lg,
            padding: space.lg,
            gap: space.md,
          }}
        >
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Chip
              label={t('common.today')}
              selected={value === today}
              onPress={() => pick(today)}
            />
            <Chip
              label={t('common.yesterday')}
              selected={value === addDays(today, -1)}
              onPress={() => pick(addDays(today, -1))}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton
              icon="chevron-left"
              label={t('common.previousMonth')}
              onPress={() => move(-1)}
            />
            <T variant="heading" center style={{ flex: 1 }} accessibilityLiveRegion="polite">
              {monthName(t, cursor.month)} {cursor.year}
            </T>
            <IconButton
              icon="chevron-right"
              label={t('common.nextMonth')}
              onPress={() => move(1)}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((dayNumber, index) => {
              if (dayNumber === null)
                return <View key={`e${index}`} style={{ width: '14.285%', height: 44 }} />;
              const day = toDay(cursor.year, cursor.month, dayNumber);
              const selected = day === value;
              const disabled = minDay !== undefined && day < minDay;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayNumber} ${monthName(t, cursor.month)} ${cursor.year}`}
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => pick(day)}
                  style={{
                    width: '14.285%',
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? c.accent : 'transparent',
                      borderWidth: day === today && !selected ? 1 : 0,
                      borderColor: c.accent,
                      opacity: disabled ? 0.3 : 1,
                    }}
                  >
                    <T
                      variant="label"
                      style={{ color: selected ? c.onAccent : c.text }}
                      maxFontSizeMultiplier={1.2}
                    >
                      {dayNumber}
                    </T>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
