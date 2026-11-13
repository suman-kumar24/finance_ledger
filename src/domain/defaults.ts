/**
 * Editable defaults offered during onboarding. Nothing here is hard-wired
 * into the accounting: users can rename, recolour, archive or add to all of it.
 */
import type { AccountType, CategoryKind } from './types';

export interface CategorySeed {
  key: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  name: { en: string; hi: string };
}

export const CATEGORY_SEEDS: readonly CategorySeed[] = [
  {
    key: 'food',
    kind: 'expense',
    icon: 'silverware-fork-knife',
    color: '#E07A3F',
    name: { en: 'Food & Dining', hi: 'खाना-पीना' },
  },
  {
    key: 'groceries',
    kind: 'expense',
    icon: 'cart-outline',
    color: '#5A9E4B',
    name: { en: 'Groceries', hi: 'किराना' },
  },
  {
    key: 'rent',
    kind: 'expense',
    icon: 'home-city-outline',
    color: '#7A6AC8',
    name: { en: 'Rent & Housing', hi: 'किराया और घर' },
  },
  {
    key: 'utilities',
    kind: 'expense',
    icon: 'flash-outline',
    color: '#D9A521',
    name: { en: 'Utilities', hi: 'बिजली-पानी बिल' },
  },
  {
    key: 'transport',
    kind: 'expense',
    icon: 'bus',
    color: '#3D8EC9',
    name: { en: 'Transport', hi: 'आना-जाना' },
  },
  {
    key: 'shopping',
    kind: 'expense',
    icon: 'shopping-outline',
    color: '#D45D8C',
    name: { en: 'Shopping', hi: 'खरीदारी' },
  },
  {
    key: 'health',
    kind: 'expense',
    icon: 'heart-pulse',
    color: '#D9534F',
    name: { en: 'Health', hi: 'सेहत' },
  },
  {
    key: 'entertainment',
    kind: 'expense',
    icon: 'movie-open-outline',
    color: '#9B59B6',
    name: { en: 'Entertainment', hi: 'मनोरंजन' },
  },
  {
    key: 'subscriptions',
    kind: 'expense',
    icon: 'repeat',
    color: '#2FA4A0',
    name: { en: 'Subscriptions', hi: 'सब्सक्रिप्शन' },
  },
  {
    key: 'travel',
    kind: 'expense',
    icon: 'airplane',
    color: '#4A7BD0',
    name: { en: 'Travel', hi: 'यात्रा' },
  },
  {
    key: 'family',
    kind: 'expense',
    icon: 'account-heart-outline',
    color: '#C7724E',
    name: { en: 'Family Support', hi: 'परिवार को मदद' },
  },
  {
    key: 'education',
    kind: 'expense',
    icon: 'school-outline',
    color: '#5772C4',
    name: { en: 'Education', hi: 'पढ़ाई' },
  },
  {
    key: 'personal_care',
    kind: 'expense',
    icon: 'content-cut',
    color: '#C96BB2',
    name: { en: 'Personal Care', hi: 'निजी देखभाल' },
  },
  {
    key: 'gifts',
    kind: 'expense',
    icon: 'gift-outline',
    color: '#E0607E',
    name: { en: 'Gifts', hi: 'उपहार' },
  },
  {
    key: 'fees',
    kind: 'expense',
    icon: 'cash-minus',
    color: '#7F8C8D',
    name: { en: 'Fees & Charges', hi: 'शुल्क' },
  },
  {
    key: 'other',
    kind: 'expense',
    icon: 'dots-horizontal-circle-outline',
    color: '#8A8F98',
    name: { en: 'Other', hi: 'अन्य' },
  },
  {
    key: 'salary',
    kind: 'income',
    icon: 'briefcase-outline',
    color: '#2E9E6B',
    name: { en: 'Salary', hi: 'वेतन' },
  },
  {
    key: 'freelance',
    kind: 'income',
    icon: 'laptop',
    color: '#3AA6A0',
    name: { en: 'Freelance', hi: 'फ्रीलांस' },
  },
  {
    key: 'interest',
    kind: 'income',
    icon: 'percent-outline',
    color: '#5A9E4B',
    name: { en: 'Interest', hi: 'ब्याज' },
  },
  {
    key: 'refunds',
    kind: 'income',
    icon: 'cash-refund',
    color: '#4A7BD0',
    name: { en: 'Refunds', hi: 'रिफंड' },
  },
  {
    key: 'other_income',
    kind: 'income',
    icon: 'dots-horizontal-circle-outline',
    color: '#8A8F98',
    name: { en: 'Other', hi: 'अन्य' },
  },
];

export interface BudgetTemplate {
  key: string;
  name: { en: string; hi: string };
  /** Category seed keys the group covers. */
  categories: string[];
  /** Suggested share of monthly income, in percent. */
  sharePercent: number;
}

/** Suggested budget groups for onboarding; limits are derived from the income the user enters. */
export const BUDGET_TEMPLATES: readonly BudgetTemplate[] = [
  {
    key: 'home',
    name: { en: 'Home & Bills', hi: 'घर और बिल' },
    categories: ['rent', 'utilities'],
    sharePercent: 30,
  },
  {
    key: 'food',
    name: { en: 'Food', hi: 'खाना' },
    categories: ['food', 'groceries'],
    sharePercent: 15,
  },
  {
    key: 'transport',
    name: { en: 'Getting around', hi: 'आना-जाना' },
    categories: ['transport', 'travel'],
    sharePercent: 8,
  },
  {
    key: 'lifestyle',
    name: { en: 'Shopping & Fun', hi: 'खरीदारी और मनोरंजन' },
    categories: ['shopping', 'entertainment', 'subscriptions', 'personal_care', 'gifts'],
    sharePercent: 12,
  },
  {
    key: 'family',
    name: { en: 'Family & Health', hi: 'परिवार और सेहत' },
    categories: ['family', 'health', 'education'],
    sharePercent: 10,
  },
];

export const ACCOUNT_ICONS: Record<AccountType, string> = {
  bank: 'bank-outline',
  cash: 'cash',
  wallet: 'wallet-outline',
  credit_card: 'credit-card-outline',
  investment: 'chart-line',
  savings: 'piggy-bank-outline',
};

/** Palette offered for accounts, categories and goals. */
export const PALETTE: readonly string[] = [
  '#0F7B6C',
  '#3D8EC9',
  '#7A6AC8',
  '#D45D8C',
  '#E07A3F',
  '#D9A521',
  '#5A9E4B',
  '#D9534F',
  '#2FA4A0',
  '#5772C4',
  '#9B59B6',
  '#7F8C8D',
];

export const ICON_CHOICES: readonly string[] = [
  'silverware-fork-knife',
  'cart-outline',
  'home-city-outline',
  'flash-outline',
  'bus',
  'car',
  'gas-station',
  'shopping-outline',
  'heart-pulse',
  'pill',
  'movie-open-outline',
  'repeat',
  'airplane',
  'account-heart-outline',
  'school-outline',
  'content-cut',
  'gift-outline',
  'cash-minus',
  'briefcase-outline',
  'laptop',
  'percent-outline',
  'cash-refund',
  'phone',
  'wifi',
  'water',
  'paw',
  'baby-carriage',
  'dumbbell',
  'book-open-variant',
  'coffee',
  'tshirt-crew',
  'tools',
  'bank-outline',
  'cash',
  'wallet-outline',
  'credit-card-outline',
  'chart-line',
  'piggy-bank-outline',
  'target',
  'beach',
  'cellphone',
  'bike',
  'train',
  'hospital-box-outline',
  'shield-check-outline',
  'dots-horizontal-circle-outline',
];
