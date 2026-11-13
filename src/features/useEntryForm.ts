import { useMemo, useState } from 'react';

import type { Lookups } from '@/data/queries';
import {
  createTransaction,
  lastUsedAccountId,
  updateTransaction,
  type TransactionInput,
} from '@/data/transactions';
import { getDb } from '@/db/client';
import type { Day } from '@/domain/dates';
import { currencyInfo, parseAmount, toDecimalString } from '@/domain/money';
import type {
  Account,
  PaymentMethod,
  Transaction,
  TransactionSource,
  TransactionType,
} from '@/domain/types';

export interface EntryForm {
  type: TransactionType;
  amountText: string;
  /** For adjustments: whether the amount lowers the balance. */
  negative: boolean;
  categoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  method: PaymentMethod | null;
  day: Day;
  payee: string;
  note: string;
  tags: string;
  source: TransactionSource;
}

export function defaultMethod(account: Account | undefined): PaymentMethod | null {
  switch (account?.type) {
    case 'cash':
      return 'cash';
    case 'credit_card':
      return 'card';
    case 'wallet':
      return 'wallet';
    case 'bank':
      return 'upi';
    default:
      return null;
  }
}

export function formFromTransaction(tx: Transaction, decimals: number): EntryForm {
  return {
    type: tx.type,
    amountText: toDecimalString(Math.abs(tx.amount), decimals).replace(/\.0+$/, ''),
    negative: tx.amount < 0,
    categoryId: tx.categoryId,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId,
    method: tx.method,
    day: tx.day,
    payee: tx.payee ?? '',
    note: tx.note ?? '',
    tags: tx.tags.join(', '),
    source: tx.source,
  };
}

/** The account to start with: the one used last for this type, else the first sensible one. */
export function pickDefaultAccount(lookups: Lookups, type: TransactionType): string | null {
  const active = lookups.accounts.filter((a) => !a.archived);
  const last = lastUsedAccountId(getDb(), type);
  if (last && active.some((a) => a.id === last)) return last;
  const preferred =
    active.find((a) => a.type === 'bank') ?? active.find((a) => a.type !== 'credit_card');
  return (preferred ?? active[0])?.id ?? null;
}

export function emptyForm(
  lookups: Lookups,
  today: Day,
  type: TransactionType = 'expense',
): EntryForm {
  const accountId = pickDefaultAccount(lookups, type);
  return {
    type,
    amountText: '',
    negative: false,
    categoryId: null,
    accountId,
    toAccountId: null,
    method: defaultMethod(accountId ? lookups.accountById.get(accountId) : undefined),
    day: today,
    payee: '',
    note: '',
    tags: '',
    source: 'manual',
  };
}

/** Converts the form into a repository input; null while the amount or accounts are missing. */
export function toInput(form: EntryForm, today: Day, decimals: number): TransactionInput | null {
  const amount = parseAmount(form.amountText, decimals);
  if (amount === null || amount <= 0 || form.accountId === null) return null;
  const moves = form.type === 'transfer' || form.type === 'card_payment';
  if (moves && (form.toAccountId === null || form.toAccountId === form.accountId)) return null;
  return {
    type: form.type,
    amount: form.type === 'adjustment' && form.negative ? -amount : amount,
    day: form.day,
    accountId: form.accountId,
    toAccountId: moves ? form.toAccountId : null,
    categoryId: moves ? null : form.categoryId,
    payee: form.payee,
    method: moves ? null : form.method,
    note: form.note,
    tags: form.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // An entry dated in the future is a plan until its day arrives.
    status: form.day > today ? 'scheduled' : 'cleared',
    source: form.source,
  };
}

export function useEntryForm(initial: EntryForm, currency: string, today: Day) {
  const [form, setForm] = useState<EntryForm>(initial);
  const decimals = currencyInfo(currency).decimals;
  const input = useMemo(() => toInput(form, today, decimals), [form, today, decimals]);
  const patch = (changes: Partial<EntryForm>) => setForm((current) => ({ ...current, ...changes }));
  const save = (id?: string): Transaction | null => {
    if (!input) return null;
    return id ? updateTransaction(getDb(), id, input) : createTransaction(getDb(), input);
  };
  return { form, setForm, patch, input, save, decimals };
}
