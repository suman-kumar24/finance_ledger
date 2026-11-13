import fs from 'node:fs';
import path from 'node:path';

import { en } from '../en';
import { hi } from '../hi';
import { dayLabel, friendlyDay, monthName, periodLabel, translate } from '../index';

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('translations', () => {
  it('has a Hindi string for every English one, with the same placeholders', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(hi[key].trim()).not.toBe('');
      expect(`${key}:${placeholders(hi[key])}`).toBe(`${key}:${placeholders(en[key])}`);
    }
  });

  it('defines every key the screens use', () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'i18n') walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          for (const m of fs.readFileSync(full, 'utf8').matchAll(/\bt\(\s*'([\w.]+)'/g))
            used.add(m[1]!);
        }
      }
    };
    walk(path.join(__dirname, '..', '..'));
    expect([...used].filter((key) => !(key in en))).toEqual([]);
  });

  it('fills placeholders and formats dates', () => {
    const t = (key: keyof typeof en, params?: Record<string, string | number>) =>
      translate('en', key, params);
    expect(t('overview.dayOf', { day: 13, total: 30 })).toBe('day 13 of 30');
    expect(translate('hi', 'common.today')).toBe('आज');
    expect(t('overview.dayOf', { day: 1 })).toBe('day 1 of {total}');
    expect(monthName(t, 11)).toBe('November');
    expect(monthName(t, 11, true)).toBe('Nov');
    expect(periodLabel(t, '2025-11')).toBe('November 2025');
    expect(periodLabel(t, '2025-11', true)).toBe('Nov 25');
    expect(dayLabel(t, '2025-11-13', '2025-01-01')).toBe('13 Nov');
    expect(dayLabel(t, '2024-11-13', '2025-01-01')).toBe('13 Nov 2024');
    expect(friendlyDay(t, '2025-11-13', '2025-11-13', '2025-11-12')).toBe('Today');
    expect(friendlyDay(t, '2025-11-12', '2025-11-13', '2025-11-12')).toBe('Yesterday');
    expect(friendlyDay(t, '2025-11-10', '2025-11-13', '2025-11-12')).toBe('Mon, 10 Nov');
  });
});
