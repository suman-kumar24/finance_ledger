import type { Day } from '@/domain/dates';
import type {
  Account,
  AccountType,
  Budget,
  Category,
  LedgerEntry,
  TransactionType,
} from '@/domain/types';

export function account(id: string, type: AccountType, overrides: Partial<Account> = {}): Account {
  return {
    id,
    name: id,
    type,
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
    color: '#000000',
    icon: 'bank',
    archived: false,
    creditLimit: null,
    statementDay: null,
    dueDay: null,
    last4: null,
    sortOrder: 0,
    ...overrides,
  };
}

export function category(
  id: string,
  kind: 'expense' | 'income' = 'expense',
  parentId: string | null = null,
): Category {
  return {
    id,
    name: id,
    kind,
    icon: 'tag',
    color: '#000000',
    parentId,
    archived: false,
    systemKey: null,
    sortOrder: 0,
  };
}

export function entry(
  type: TransactionType,
  amount: number,
  day: Day,
  accountId: string,
  extra: Partial<LedgerEntry> = {},
): LedgerEntry {
  return {
    type,
    amount,
    day,
    accountId,
    toAccountId: null,
    categoryId: null,
    status: 'cleared',
    ...extra,
  };
}

export function budget(
  id: string,
  limit: number,
  categoryIds: string[],
  extra: Partial<Budget> = {},
): Budget {
  return {
    id,
    seriesId: id,
    name: id,
    period: '2025-03',
    limit,
    recurring: true,
    categoryIds,
    sortOrder: 0,
    ...extra,
  };
}

export function mapById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}
