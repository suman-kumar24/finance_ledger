import { useCallback } from 'react';

import type { Language } from '@/data/settings';
import { parseDay, weekday, type Day } from '@/domain/dates';
import { parsePeriodKey } from '@/domain/months';
import { useSettings } from '@/hooks/useSettings';

import { en, type StringKey } from './en';
import { hi } from './hi';

const TABLES: Record<Language, Record<StringKey, string>> = { en, hi };

export type Params = Record<string, string | number>;

/** Looks up a string and fills `{name}` placeholders. */
export function translate(language: Language, key: StringKey, params?: Params): string {
  const template = TABLES[language][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type Translate = (key: StringKey, params?: Params) => string;

const MONTH_KEYS: StringKey[] = [
  'month.1',
  'month.2',
  'month.3',
  'month.4',
  'month.5',
  'month.6',
  'month.7',
  'month.8',
  'month.9',
  'month.10',
  'month.11',
  'month.12',
];
const WEEKDAY_KEYS: StringKey[] = [
  'weekday.0',
  'weekday.1',
  'weekday.2',
  'weekday.3',
  'weekday.4',
  'weekday.5',
  'weekday.6',
];

export function monthName(t: Translate, month: number, short = false): string {
  const name = t(MONTH_KEYS[month - 1] ?? 'month.1');
  return short ? name.slice(0, 3) : name;
}

/** "November 2025" */
export function periodLabel(t: Translate, key: string, short = false): string {
  const { year, month } = parsePeriodKey(key);
  return short
    ? `${monthName(t, month, true)} ${String(year).slice(2)}`
    : `${monthName(t, month)} ${year}`;
}

/** "13 Nov" or "13 Nov 2024" (year shown when it differs from `today`'s). */
export function dayLabel(t: Translate, day: Day, today?: Day): string {
  const d = parseDay(day);
  const base = `${d.day} ${monthName(t, d.month, true)}`;
  if (today && parseDay(today).year === d.year) return base;
  return `${base} ${d.year}`;
}

/** "Today", "Yesterday", or "Thu, 13 Nov". */
export function friendlyDay(t: Translate, day: Day, today: Day, yesterday: Day): string {
  if (day === today) return t('common.today');
  if (day === yesterday) return t('common.yesterday');
  return `${t(WEEKDAY_KEYS[weekday(day)] ?? 'weekday.0')}, ${dayLabel(t, day, today)}`;
}

export function useT(): Translate {
  const { language } = useSettings();
  return useCallback((key, params) => translate(language, key, params), [language]);
}

export type { StringKey };
