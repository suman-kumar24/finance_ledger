/**
 * SQLite schema (Drizzle). All money columns are INTEGER minor units.
 * After changing this file run `npm run db:generate` to create a migration.
 */
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type {
  AccountType,
  CategoryKind,
  Frequency,
  PaymentMethod,
  Priority,
  PurchaseStatus,
  RecurringMode,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '@/domain/types';

const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
};

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<AccountType>().notNull(),
    openingBalance: integer('opening_balance').notNull().default(0),
    openingDate: text('opening_date').notNull(),
    currency: text('currency').notNull(),
    color: text('color').notNull(),
    icon: text('icon').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    creditLimit: integer('credit_limit'),
    statementDay: integer('statement_day'),
    dueDay: integer('due_day'),
    last4: text('last4'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('accounts_type_idx').on(t.type)],
);

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').$type<CategoryKind>().notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    parentId: text('parent_id'),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    systemKey: text('system_key'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('categories_parent_idx').on(t.parentId)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<TransactionType>().notNull(),
    amount: integer('amount').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    day: text('day').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    toAccountId: text('to_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    payee: text('payee'),
    method: text('method').$type<PaymentMethod>(),
    note: text('note'),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    status: text('status').$type<TransactionStatus>().notNull().default('cleared'),
    source: text('source').$type<TransactionSource>().notNull().default('manual'),
    smsHash: text('sms_hash'),
    recurringRuleId: text('recurring_rule_id'),
    ...timestamps,
  },
  (t) => [
    index('tx_day_idx').on(t.day, t.occurredAt),
    index('tx_account_day_idx').on(t.accountId, t.day),
    index('tx_to_account_day_idx').on(t.toAccountId, t.day),
    index('tx_category_day_idx').on(t.categoryId, t.day),
    index('tx_status_day_idx').on(t.status, t.day),
    index('tx_amount_idx').on(t.amount),
    uniqueIndex('tx_sms_hash_idx').on(t.smsHash),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    name: text('name').notNull(),
    period: text('period').notNull(),
    limit: integer('limit_amount').notNull(),
    recurring: integer('recurring', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('budgets_period_idx').on(t.period),
    uniqueIndex('budgets_series_period_idx').on(t.seriesId, t.period),
  ],
);

export const budgetCategories = sqliteTable(
  'budget_categories',
  {
    budgetId: text('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.budgetId, t.categoryId] })],
);

export const recurringRules = sqliteTable('recurring_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<'expense' | 'income' | 'transfer' | 'card_payment'>().notNull(),
  amount: integer('amount').notNull(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  toAccountId: text('to_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  method: text('method').$type<PaymentMethod>(),
  frequency: text('frequency').$type<Frequency>().notNull(),
  interval: integer('interval').notNull().default(1),
  anchorDay: integer('anchor_day'),
  nextDate: text('next_date').notNull(),
  endDate: text('end_date'),
  mode: text('mode').$type<RecurringMode>().notNull().default('remind'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  note: text('note'),
  ...timestamps,
});

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  targetAmount: integer('target_amount').notNull(),
  targetDate: text('target_date'),
  accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  color: text('color').notNull(),
  icon: text('icon').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

export const goalContributions = sqliteTable(
  'goal_contributions',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    day: text('day').notNull(),
    note: text('note'),
    transactionId: text('transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('goal_contrib_goal_idx').on(t.goalId)],
);

export const plannedPurchases = sqliteTable('planned_purchases', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  estimatedPrice: integer('estimated_price').notNull(),
  priority: text('priority').$type<Priority>().notNull().default('medium'),
  fundingNotes: text('funding_notes'),
  status: text('status').$type<PurchaseStatus>().notNull().default('thinking'),
  transactionId: text('transaction_id').references(() => transactions.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
});

/** Per-cycle figures the user typed in from a card statement. */
export const cardStatements = sqliteTable(
  'card_statements',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    statementDate: text('statement_date').notNull(),
    minimumDue: integer('minimum_due'),
    statedTotal: integer('stated_total'),
    ...timestamps,
  },
  (t) => [uniqueIndex('card_statements_account_date_idx').on(t.accountId, t.statementDate)],
);

/** History of balance checks against the bank app or statement. */
export const reconciliations = sqliteTable(
  'reconciliations',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    statedBalance: integer('stated_balance').notNull(),
    computedBalance: integer('computed_balance').notNull(),
    adjustmentTransactionId: text('adjustment_transaction_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('reconciliations_account_idx').on(t.accountId, t.day)],
);

/** Key/value settings; values are JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** User-edited and learned keyword -> category links for the entry parser. */
export const categoryKeywords = sqliteTable(
  'category_keywords',
  {
    id: text('id').primaryKey(),
    keyword: text('keyword').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    origin: text('origin').$type<'user' | 'learned'>().notNull().default('user'),
    hits: integer('hits').notNull().default(1),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('category_keywords_keyword_idx').on(t.keyword)],
);

/**
 * Parsed bank alerts waiting for review. Holds structured fields only; the
 * raw SMS text is never written to the database.
 */
export const smsInbox = sqliteTable(
  'sms_inbox',
  {
    id: text('id').primaryKey(),
    hash: text('hash').notNull(),
    direction: text('direction').$type<'debit' | 'credit'>().notNull(),
    amount: integer('amount').notNull(),
    last4: text('last4'),
    merchant: text('merchant'),
    method: text('method').$type<PaymentMethod>(),
    instrument: text('instrument').$type<'account' | 'card' | 'wallet' | 'unknown'>().notNull(),
    occurredAt: integer('occurred_at').notNull(),
    day: text('day').notNull(),
    balance: integer('balance'),
    sender: text('sender'),
    patternId: text('pattern_id').notNull(),
    status: text('status')
      .$type<'pending' | 'accepted' | 'dismissed'>()
      .notNull()
      .default('pending'),
    accountId: text('account_id'),
    categoryId: text('category_id'),
    transactionId: text('transaction_id'),
    possibleDuplicateOf: text('possible_duplicate_of'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('sms_inbox_hash_idx').on(t.hash),
    index('sms_inbox_status_idx').on(t.status, t.day),
  ],
);

/** The user's one-time mapping of "last 4 digits" to an account. */
export const smsAccountMap = sqliteTable('sms_account_map', {
  last4: text('last4').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
});

/** Remembers which alerts already fired so each fires once (brief §8). */
export const alertLog = sqliteTable('alert_log', {
  key: text('key').primaryKey(),
  firedAt: integer('fired_at').notNull(),
});
