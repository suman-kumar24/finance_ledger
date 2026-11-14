/**
 * Transactions as CSV. One row per transaction; amounts are plain decimals
 * (never floats on the way out) with a separate signed column for sums.
 */
import { toDecimalString } from '../domain/money';
import type { Account, Category, Transaction } from '../domain/types';
import { toCsv } from './csv';

export const EXPORT_HEADERS = [
  'Date',
  'Time',
  'Type',
  'Amount',
  'Signed amount',
  'Currency',
  'Account',
  'To account',
  'Category',
  'Subcategory',
  'Payee',
  'Method',
  'Note',
  'Tags',
  'Status',
  'Source',
  'Id',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export interface ExportContext {
  accounts: ReadonlyMap<string, Pick<Account, 'name' | 'currency'>>;
  categories: ReadonlyMap<string, Pick<Category, 'name' | 'parentId'>>;
  decimals: number;
  currency: string;
}

/** Money out is negative, money in positive, moves between own accounts zero-sum (shown negative on the source). */
export function signedAmount(tx: Pick<Transaction, 'type' | 'amount'>): number {
  switch (tx.type) {
    case 'income':
    case 'refund':
    case 'adjustment':
      return tx.amount;
    default:
      return -tx.amount;
  }
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  ctx: ExportContext,
): string {
  const rows: (string | number)[][] = [[...EXPORT_HEADERS]];
  for (const tx of transactions) {
    const category = tx.categoryId ? ctx.categories.get(tx.categoryId) : undefined;
    const parent = category?.parentId ? ctx.categories.get(category.parentId) : undefined;
    const when = new Date(tx.occurredAt);
    rows.push([
      tx.day,
      `${pad(when.getHours())}:${pad(when.getMinutes())}`,
      tx.type,
      toDecimalString(Math.abs(tx.amount), ctx.decimals),
      toDecimalString(signedAmount(tx), ctx.decimals),
      ctx.accounts.get(tx.accountId)?.currency ?? ctx.currency,
      ctx.accounts.get(tx.accountId)?.name ?? '',
      tx.toAccountId ? (ctx.accounts.get(tx.toAccountId)?.name ?? '') : '',
      parent ? parent.name : (category?.name ?? ''),
      parent ? (category?.name ?? '') : '',
      tx.payee ?? '',
      tx.method ?? '',
      tx.note ?? '',
      tx.tags.join('; '),
      tx.status,
      tx.source,
      tx.id,
    ]);
  }
  return toCsv(rows);
}
