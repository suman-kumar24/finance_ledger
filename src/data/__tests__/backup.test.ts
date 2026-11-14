import { createTestDb } from '../../../test/db';
import { randomBytes } from 'node:crypto';
import type { Db } from '@/db/types';
import { decryptText, encryptText } from '@/backup/format/crypto';
import { SnapshotError } from '@/backup/format/snapshot';
import { createDriveClient } from '@/backup/drive/client';

import { createAccount, getBalances } from '../accounts';
import { exportSnapshot, restoreSnapshot } from '../backup';
import { createBudget } from '../budgets';
import { createCategory } from '../categories';
import { saveImportedRows } from '../importCsv';
import { createGoal, addContribution } from '../plans';
import { getSettings, updateSettings } from '../settings';
import { createTransaction, listTransactions } from '../transactions';
import { guessMapping, mapRows, parseCsv } from '@/csv';

function populated(): Db {
  const { db } = createTestDb();
  const bank = createAccount(db, {
    name: 'Bank',
    type: 'bank',
    openingBalance: 10_000_00,
    openingDate: '2025-01-01',
    currency: 'INR',
  });
  const card = createAccount(db, {
    name: 'Card',
    type: 'credit_card',
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
    statementDay: 5,
  });
  const food = createCategory(db, { name: 'Food', kind: 'expense' });
  createTransaction(db, {
    type: 'expense',
    amount: 1_234_56,
    day: '2025-03-02',
    accountId: card.id,
    categoryId: food.id,
    payee: 'Café ₹',
    tags: ['a'],
  });
  createTransaction(db, {
    type: 'card_payment',
    amount: 500_00,
    day: '2025-03-10',
    accountId: bank.id,
    toAccountId: card.id,
  });
  createBudget(db, {
    name: 'Food',
    period: '2025-03',
    limit: 5_000_00,
    recurring: true,
    categoryIds: [food.id],
  });
  const goal = createGoal(db, {
    name: 'G',
    targetAmount: 100,
    targetDate: null,
    accountId: null,
    color: '#000',
    icon: 'target',
  });
  addContribution(db, { goalId: goal.id, amount: 10, day: '2025-03-10' }, '2025-03-10');
  updateSettings(db, {
    currency: 'USD',
    onboarded: true,
    lockEnabled: true,
    backupAccount: 'x@example.invalid',
  });
  return db;
}

describe('backup and restore', () => {
  it('round-trips all data exactly, through JSON and encryption', async () => {
    const source = populated();
    const before = getBalances(source);
    const snapshot = exportSnapshot(source, '1.0.0', 1000);
    expect(snapshot.counts).toMatchObject({ accounts: 2, transactions: 2, budgets: 1, goals: 1 });
    const text = JSON.stringify(snapshot);
    const sealed = await encryptText(
      text,
      'correct horse battery',
      1000,
      (n) => new Uint8Array(randomBytes(n)),
      { N: 1024, r: 8, p: 1 },
    );
    const opened = JSON.parse(await decryptText(sealed, 'correct horse battery'));

    const { db: target } = createTestDb();
    createAccount(target, {
      name: 'Old',
      type: 'cash',
      openingBalance: 1,
      openingDate: '2025-01-01',
      currency: 'INR',
    });
    updateSettings(target, { lockEnabled: false, backupAccount: 'mine@example.invalid' });
    restoreSnapshot(target, opened);
    expect(getBalances(target)).toEqual(before);
    expect(listTransactions(target).map((t) => [t.amount, t.payee, t.tags])).toEqual(
      listTransactions(source).map((t) => [t.amount, t.payee, t.tags]),
    );
    // This phone's own settings are kept; the data's settings are restored.
    expect(getSettings(target)).toMatchObject({
      currency: 'USD',
      onboarded: true,
      lockEnabled: false,
      backupAccount: 'mine@example.invalid',
    });
  });

  it('leaves device-only settings out of a backup', () => {
    const snapshot = exportSnapshot(populated(), '1.0.0');
    const keys = snapshot.data.settings.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['currency', 'onboarded']));
    expect(keys).not.toContain('lockEnabled');
    expect(keys).not.toContain('backupAccount');
  });

  it('changes nothing when the file is bad', () => {
    const db = populated();
    const before = JSON.stringify(exportSnapshot(db, '1', 1));
    expect(() => restoreSnapshot(db, { app: 'ledger' })).toThrow(SnapshotError);
    const bad = exportSnapshot(db, '1', 1);
    bad.data.transactions[0] = { ...bad.data.transactions[0], accountId: 'does-not-exist' };
    expect(() => restoreSnapshot(db, bad)).toThrow();
    expect(JSON.stringify(exportSnapshot(db, '1', 1))).toBe(before);
  });
});

describe('Drive client', () => {
  it('talks only to googleapis.com, sends the token, and keeps to the app-data folder', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = url.includes('alt=media')
        ? 'content'
        : init?.method === 'POST'
          ? JSON.stringify({ id: 'n', name: 'f', createdTime: '2025-01-01T00:00:00Z', size: '5' })
          : JSON.stringify({
              files: [{ id: 'a', name: 'x', createdTime: '2025-01-02T00:00:00Z', size: '9' }],
            });
      return new Response(body, { status: 200 });
    });
    const drive = createDriveClient(async () => 'tok', fetchImpl);
    expect(await drive.list()).toEqual([
      { id: 'a', name: 'x', createdTime: Date.parse('2025-01-02T00:00:00Z'), size: 9 },
    ]);
    expect((await drive.upload('f.json', '{"a":1}')).id).toBe('n');
    expect(await drive.download('a')).toBe('content');
    await drive.remove('a');
    for (const call of calls) {
      expect(new URL(call.url).host).toBe('www.googleapis.com');
      expect((call.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    }
    expect(calls[0]!.url).toContain('spaces=appDataFolder');
    expect(String(calls[1]!.init?.body)).toContain('"parents":["appDataFolder"]');
    expect(calls[3]!.init?.method).toBe('DELETE');
  });

  it('reports failures', async () => {
    const drive = createDriveClient(
      async () => 't',
      async () => new Response('nope', { status: 403 }),
    );
    await expect(drive.list()).rejects.toMatchObject({ status: 403 });
  });
});

describe('CSV import into the ledger', () => {
  it('saves reviewed rows as imported transactions', () => {
    const { db } = createTestDb();
    const bank = createAccount(db, {
      name: 'Bank',
      type: 'bank',
      openingBalance: 0,
      openingDate: '2025-01-01',
      currency: 'INR',
    });
    const [headers, ...rows] = parseCsv(
      'Date,Narration,Withdrawal,Deposit\n12/03/2025,Shop,250.00,\n01/03/2025,Salary,,5000',
    );
    const { drafts } = mapRows(rows, guessMapping(headers!), {
      accountsByName: new Map(),
      categoriesByName: new Map(),
      defaultAccountId: bank.id,
      decimals: 2,
      dateOrder: 'dmy',
      today: '2025-03-20',
    });
    expect(saveImportedRows(db, drafts, '2025-03-20')).toEqual({ saved: 2, failed: [] });
    expect(listTransactions(db).map((t) => [t.type, t.amount, t.source])).toEqual([
      ['expense', 250_00, 'import'],
      ['income', 5_000_00, 'import'],
    ]);
    expect(getBalances(db).get(bank.id)).toBe(4_750_00);
  });
});
