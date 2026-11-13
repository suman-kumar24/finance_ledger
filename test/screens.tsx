/**
 * Helpers for rendering real screens in Jest against an in-memory SQLite
 * database (the same schema and migrations the app uses).
 */
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createAccount } from '@/data/accounts';
import { seedDefaultCategories } from '@/data/categories';
import { updateSettings } from '@/data/settings';
import type { Db } from '@/db/types';

import { createTestDb } from './db';

let current: Db | null = null;

export function testDb(): Db {
  if (!current) throw new Error('call resetTestDb() first');
  return current;
}

export function resetTestDb(): Db {
  current = createTestDb().db;
  return current;
}

/** A small onboarded ledger: one bank account, one card, default categories. */
export function seedBasics(db: Db) {
  updateSettings(db, { onboarded: true });
  seedDefaultCategories(db, 'en');
  const bank = createAccount(db, {
    name: 'Everyday Bank',
    type: 'bank',
    openingBalance: 50_000_00,
    openingDate: '2025-01-01',
    currency: 'INR',
  });
  const card = createAccount(db, {
    name: 'Rewards Card',
    type: 'credit_card',
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
    creditLimit: 100_000_00,
    statementDay: 5,
    dueDay: 25,
    last4: '4321',
  });
  return { bank, card };
}

export async function renderScreen(element: ReactElement) {
  return render(element);
}
