import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

import { ACCOUNT_ICONS, BUDGET_TEMPLATES, CATEGORY_SEEDS, ICON_CHOICES } from '../defaults';

describe('defaults', () => {
  it('seeds the categories named in the brief', () => {
    expect(CATEGORY_SEEDS.filter((s) => s.kind === 'expense').map((s) => s.name.en)).toEqual([
      'Food & Dining',
      'Groceries',
      'Rent & Housing',
      'Utilities',
      'Transport',
      'Shopping',
      'Health',
      'Entertainment',
      'Subscriptions',
      'Travel',
      'Family Support',
      'Education',
      'Personal Care',
      'Gifts',
      'Fees & Charges',
      'Other',
    ]);
    expect(CATEGORY_SEEDS.filter((s) => s.kind === 'income').map((s) => s.name.en)).toEqual([
      'Salary',
      'Freelance',
      'Interest',
      'Refunds',
      'Other',
    ]);
    expect(new Set(CATEGORY_SEEDS.map((s) => s.key)).size).toBe(CATEGORY_SEEDS.length);
  });

  it('uses only icons that exist', () => {
    const names = [
      ...CATEGORY_SEEDS.map((s) => s.icon),
      ...Object.values(ACCOUNT_ICONS),
      ...ICON_CHOICES,
    ];
    expect(names.filter((name) => !(name in glyphs))).toEqual([]);
  });

  it('builds budget templates from real category keys and a sensible share', () => {
    const keys = new Set(CATEGORY_SEEDS.map((s) => s.key));
    for (const template of BUDGET_TEMPLATES) {
      for (const key of template.categories) expect(keys.has(key)).toBe(true);
    }
    expect(BUDGET_TEMPLATES.reduce((sum, b) => sum + b.sharePercent, 0)).toBeLessThanOrEqual(100);
  });
});
