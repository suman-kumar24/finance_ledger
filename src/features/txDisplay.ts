import type { Lookups } from '@/data/queries';
import type { Minor } from '@/domain/money';
import type {
  AccountType,
  PaymentMethod,
  Transaction,
  TransactionSource,
  TransactionType,
} from '@/domain/types';
import type { StringKey, Translate } from '@/i18n';

export const TYPE_LABEL: Record<TransactionType, StringKey> = {
  expense: 'type.expense',
  income: 'type.income',
  transfer: 'type.transfer',
  card_payment: 'type.card_payment',
  refund: 'type.refund',
  adjustment: 'type.adjustment',
};

export const TYPE_ICON: Record<TransactionType, string> = {
  expense: 'arrow-up-circle-outline',
  income: 'arrow-down-circle-outline',
  transfer: 'swap-horizontal',
  card_payment: 'credit-card-check-outline',
  refund: 'cash-refund',
  adjustment: 'scale-balance',
};

export const METHOD_LABEL: Record<PaymentMethod, StringKey> = {
  upi: 'method.upi',
  card: 'method.card',
  cash: 'method.cash',
  netbanking: 'method.netbanking',
  wallet: 'method.wallet',
  other: 'method.other',
};

export const METHOD_ICON: Record<PaymentMethod, string> = {
  upi: 'cellphone-nfc',
  card: 'credit-card-outline',
  cash: 'cash',
  netbanking: 'bank-transfer',
  wallet: 'wallet-outline',
  other: 'dots-horizontal',
};

export const SOURCE_LABEL: Record<TransactionSource, StringKey> = {
  manual: 'source.manual',
  voice: 'source.voice',
  sms: 'source.sms',
  recurring: 'source.recurring',
  import: 'source.import',
};

export interface TxDisplay {
  title: string;
  subtitle: string;
  icon: string;
  color: string | null;
  /** Signed amount as it affects the user's money: negative for money out. */
  signed: Minor;
  tone: 'default' | 'positive' | 'muted';
  sign: 'auto' | 'always' | 'never';
}

/** How a transaction is described in lists. */
export function describeTransaction(tx: Transaction, lookups: Lookups, t: Translate): TxDisplay {
  const category = tx.categoryId ? lookups.categoryById.get(tx.categoryId) : undefined;
  const account = lookups.accountById.get(tx.accountId);
  const to = tx.toAccountId ? lookups.accountById.get(tx.toAccountId) : undefined;
  const typeLabel = t(TYPE_LABEL[tx.type]);
  const parts: string[] = [];
  let title = tx.payee ?? category?.name ?? typeLabel;
  let signed = tx.amount;
  let tone: TxDisplay['tone'] = 'default';
  let sign: TxDisplay['sign'] = 'auto';

  switch (tx.type) {
    case 'expense':
      signed = -tx.amount;
      if (tx.payee && category) parts.push(category.name);
      break;
    case 'income':
    case 'refund':
      tone = 'positive';
      sign = 'always';
      if (tx.payee && category) parts.push(category.name);
      if (!tx.payee && !category) title = typeLabel;
      else if (tx.type === 'refund') parts.unshift(typeLabel);
      break;
    case 'transfer':
    case 'card_payment':
      title = tx.payee ?? typeLabel;
      tone = 'muted';
      sign = 'never';
      break;
    case 'adjustment':
      title = tx.payee ?? typeLabel;
      sign = 'always';
      tone = tx.amount > 0 ? 'positive' : 'default';
      if (category) parts.push(category.name);
      break;
  }
  if (to) parts.push(`${account?.name ?? '?'} → ${to.name}`);
  else if (account) parts.push(account.name);
  if (tx.method && tx.type !== 'transfer' && tx.type !== 'card_payment')
    parts.push(t(METHOD_LABEL[tx.method]));
  if (tx.note) parts.push(tx.note);
  return {
    title,
    subtitle: parts.join(' · '),
    icon: category?.icon ?? TYPE_ICON[tx.type],
    color: category?.color ?? null,
    signed,
    tone,
    sign,
  };
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, StringKey> = {
  bank: 'accountType.bank',
  cash: 'accountType.cash',
  wallet: 'accountType.wallet',
  credit_card: 'accountType.credit_card',
  investment: 'accountType.investment',
  savings: 'accountType.savings',
};
