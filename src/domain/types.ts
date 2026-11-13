/**
 * Core domain types. These are plain data shapes shared by the pure domain
 * modules, the database schema and the UI. See docs/DECISIONS.md for the
 * sign conventions.
 */
import type { Day } from './dates';
import type { Minor } from './money';

export const ACCOUNT_TYPES = [
  'bank',
  'cash',
  'wallet',
  'credit_card',
  'investment',
  'savings',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = [
  'expense',
  'income',
  'transfer',
  'card_payment',
  'refund',
  'adjustment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_METHODS = ['upi', 'card', 'cash', 'netbanking', 'wallet', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TRANSACTION_STATUSES = ['cleared', 'scheduled'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const TRANSACTION_SOURCES = ['manual', 'voice', 'sms', 'recurring', 'import'] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const CATEGORY_KINDS = ['expense', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const RECURRING_MODES = ['auto', 'remind'] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];

export const PURCHASE_STATUSES = ['thinking', 'saving', 'bought'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Accounts that hold spendable money. */
export const SPENDABLE_TYPES: readonly AccountType[] = ['bank', 'cash', 'wallet'];
/** Accounts that count as "Saved/Invested" when money moves into them. */
export const SAVING_TYPES: readonly AccountType[] = ['investment', 'savings'];

export function isSavingType(type: AccountType): boolean {
  return SAVING_TYPES.includes(type);
}

export function isSpendableType(type: AccountType): boolean {
  return SPENDABLE_TYPES.includes(type);
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /**
   * Signed balance on the opening date, as an ASSET value: money you have is
   * positive, money you owe is negative. A credit card that opened with
   * 5,000.00 outstanding has openingBalance = -500000.
   */
  openingBalance: Minor;
  openingDate: Day;
  currency: string;
  color: string;
  icon: string;
  archived: boolean;
  creditLimit: Minor | null;
  /** Day of month the statement is generated (1-31, clamped to month length). */
  statementDay: number | null;
  /** Day of month the payment is due (1-31, clamped to month length). */
  dueDay: number | null;
  last4: string | null;
  sortOrder: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  parentId: string | null;
  archived: boolean;
  /** Stable key of a seeded default category; links the keyword dictionary. */
  systemKey: string | null;
  sortOrder: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /**
   * Minor units. Always positive, except `adjustment`, which is signed:
   * positive raises the account's balance, negative lowers it.
   */
  amount: Minor;
  /** Epoch milliseconds of when it happened. */
  occurredAt: number;
  /** Local calendar day it happened; the unit for all month and cycle maths. */
  day: Day;
  /** The account money leaves (or, for income/refund/adjustment, the account affected). */
  accountId: string;
  /** Destination for `transfer` and `card_payment`. */
  toAccountId: string | null;
  categoryId: string | null;
  payee: string | null;
  method: PaymentMethod | null;
  note: string | null;
  tags: string[];
  status: TransactionStatus;
  source: TransactionSource;
  smsHash: string | null;
  recurringRuleId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** The fields the pure accounting functions need. */
export type LedgerEntry = Pick<
  Transaction,
  'type' | 'amount' | 'day' | 'accountId' | 'toAccountId' | 'categoryId' | 'status'
>;

export interface Budget {
  id: string;
  /** Copies of the same budget across months share a series id. */
  seriesId: string;
  name: string;
  /** Period key "YYYY-MM" (see months.ts). */
  period: string;
  limit: Minor;
  recurring: boolean;
  categoryIds: string[];
  sortOrder: number;
}

export interface RecurringRule {
  id: string;
  name: string;
  type: Extract<TransactionType, 'expense' | 'income' | 'transfer' | 'card_payment'>;
  amount: Minor;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  method: PaymentMethod | null;
  frequency: Frequency;
  /** Every N periods (1 = every period). */
  interval: number;
  /** Day of month the series is anchored to (for month-based frequencies). */
  anchorDay: number | null;
  nextDate: Day;
  endDate: Day | null;
  mode: RecurringMode;
  active: boolean;
  note: string | null;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: Minor;
  targetDate: Day | null;
  accountId: string | null;
  color: string;
  icon: string;
  archived: boolean;
  createdAt: number;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  /** Positive adds to the goal, negative withdraws. */
  amount: Minor;
  day: Day;
  note: string | null;
  transactionId: string | null;
}

export interface PlannedPurchase {
  id: string;
  name: string;
  estimatedPrice: Minor;
  priority: Priority;
  fundingNotes: string | null;
  status: PurchaseStatus;
  transactionId: string | null;
  createdAt: number;
}

export interface CardStatement {
  id: string;
  accountId: string;
  /** The statement (closing) date this record is for. */
  statementDate: Day;
  /** Minimum amount due, if the user entered it. */
  minimumDue: Minor | null;
  /** Statement total as printed, if the user entered it. */
  statedTotal: Minor | null;
}
