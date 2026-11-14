import { createTestDb } from '../../../test/db';
import type { Db } from '@/db/types';
import { IGNORED, RECEIVED, TRANSACTIONS } from '@/sms/testing/samples';
import type { RawSms } from '@/sms';

import { createAccount, getBalances } from '../accounts';
import { seedDefaultCategories } from '../categories';
import { getSettings, updateSettings } from '../settings';
import {
  acceptInboxItem,
  clearSmsData,
  countInbox,
  dismissDuplicates,
  dismissInboxItem,
  getAccountMap,
  importSms,
  isBillPayment,
  listInbox,
  mapLast4,
  suggestedType,
} from '../sms';
import { createTransaction, listTransactions } from '../transactions';

let db: Db;
let raw: ReturnType<typeof createTestDb>['raw'];
let bank: string;
let card: string;
const sample = (name: string): RawSms => TRANSACTIONS.find((s) => s.name === name)!.sms;

beforeEach(() => {
  ({ db, raw } = createTestDb());
  seedDefaultCategories(db, 'en');
  bank = createAccount(db, {
    name: 'Bank',
    type: 'bank',
    openingBalance: 50_000_00,
    openingDate: '2025-01-01',
    currency: 'INR',
    last4: '1234',
  }).id;
  card = createAccount(db, {
    name: 'Card',
    type: 'credit_card',
    openingBalance: 0,
    openingDate: '2025-01-01',
    currency: 'INR',
  }).id;
  updateSettings(db, { smsEnabled: true });
});

describe('importing bank SMS', () => {
  it('files alerts in the inbox and never straight into the ledger', () => {
    const stats = importSms(db, [sample('HDFC UPI sent'), sample('SBI Card spent')]);
    expect(stats).toEqual({ read: 2, ignored: 0, alreadySeen: 0, added: 2, flaggedDuplicates: 0 });
    expect(listTransactions(db)).toEqual([]);
    expect(countInbox(db)).toBe(2);
    expect(getBalances(db).get(bank)).toBe(50_000_00);
  });

  it('ignores OTPs, promotions and personal messages without storing anything', () => {
    const stats = importSms(
      db,
      IGNORED.map((s) => s.sms),
    );
    expect(stats).toMatchObject({ read: IGNORED.length, ignored: IGNORED.length, added: 0 });
    expect(raw.prepare('select count(*) n from sms_inbox').get()).toEqual({ n: 0 });
  });

  it('never stores the message text', () => {
    importSms(
      db,
      TRANSACTIONS.map((s) => s.sms),
    );
    const dump = JSON.stringify(raw.prepare('select * from sms_inbox').all());
    for (const fragment of [
      'Not You?',
      'Call 18000000000',
      'SMS BLOCK',
      'Dear UPI user',
      'Ref 5312',
      'https://',
    ]) {
      expect(dump).not.toContain(fragment);
    }
    const columns = (raw.prepare("pragma table_info('sms_inbox')").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).not.toContain('body');
    expect(columns).not.toContain('text');
  });

  it('skips a message it has already seen', () => {
    importSms(db, [sample('HDFC UPI sent')]);
    expect(importSms(db, [sample('HDFC UPI sent')])).toMatchObject({ added: 0, alreadySeen: 1 });
    const [item] = listInbox(db);
    acceptInboxItem(db, item!.id, { type: 'expense', accountId: bank });
    expect(importSms(db, [sample('HDFC UPI sent')])).toMatchObject({ added: 0, alreadySeen: 1 });
    expect(listTransactions(db)).toHaveLength(1);
  });

  it('matches accounts by last 4 digits, and maps unknown ones once', () => {
    importSms(db, [sample('HDFC UPI sent'), sample('SBI Card spent'), sample('ICICI card spent')]);
    const items = listInbox(db);
    expect(items.find((i) => i.last4 === '1234')?.accountId).toBe(bank);
    expect(items.filter((i) => i.last4 === '4321').every((i) => i.accountId === null)).toBe(true);
    mapLast4(db, '4321', card);
    expect(
      listInbox(db)
        .filter((i) => i.last4 === '4321')
        .every((i) => i.accountId === card),
    ).toBe(true);
    expect(getAccountMap(db).get('4321')).toBe(card);
    // A later alert for the same digits needs no question.
    importSms(db, [sample('Axis card spent')]);
    expect(listInbox(db).find((i) => i.patternId === 'card-spent-axis')?.accountId).toBe(card);
  });

  it('flags an alert that matches an entry the user added by hand', () => {
    createTransaction(db, { type: 'expense', amount: 250_00, day: '2025-11-12', accountId: bank });
    const stats = importSms(db, [sample('HDFC UPI sent')]);
    expect(stats.flaggedDuplicates).toBe(1);
    expect(listInbox(db)[0]?.possibleDuplicateOf).not.toBeNull();
    expect(dismissDuplicates(db)).toBe(1);
    expect(countInbox(db)).toBe(0);
    expect(dismissDuplicates(db)).toBe(0);
    expect(listTransactions(db)).toHaveLength(1);
  });

  it('flags two alerts about the same payment', () => {
    const first = sample('HDFC UPI sent');
    const twin: RawSms = {
      address: 'VM-UPIAPP',
      body: 'Paid Rs.250.00 to CORNER STORE via UPI. Ref 531200000099',
      date: RECEIVED + 5000,
    };
    expect(importSms(db, [first, twin])).toMatchObject({ added: 2, flaggedDuplicates: 1 });
  });

  it('suggests a category from the merchant and a type from the alert', () => {
    importSms(db, [
      {
        address: 'VM-HDFCBK',
        body: 'Rs 320.00 spent on HDFC Bank Card x4321 at ZOMATO on 2025-11-12:14:22:10.',
        date: RECEIVED,
      },
      sample('generic: card bill payment received'),
      sample('generic: refund to card'),
      sample('HDFC salary deposit'),
    ]);
    const items = listInbox(db);
    const zomato = items.find((i) => i.merchant === 'ZOMATO')!;
    expect(
      raw.prepare('select system_key k from categories where id = ?').get(zomato.categoryId),
    ).toEqual({ k: 'food' });
    expect(suggestedType(zomato)).toBe('expense');
    const bill = items.find((i) => isBillPayment(i))!;
    expect(suggestedType(bill)).toBe('card_payment');
    expect(suggestedType(items.find((i) => i.merchant === 'BOOK HOUSE')!)).toBe('refund');
    expect(suggestedType(items.find((i) => i.merchant === 'Salary NOV')!)).toBe('income');
  });

  it('adds an accepted alert with its hash, and counts a bill payment only as a payment', () => {
    createTransaction(db, {
      type: 'expense',
      amount: 12_000_00,
      day: '2025-11-01',
      accountId: card,
    });
    importSms(db, [sample('generic: card bill paid from bank')]);
    const [item] = listInbox(db);
    const tx = acceptInboxItem(db, item!.id, {
      type: 'card_payment',
      accountId: bank,
      toAccountId: card,
    });
    expect(tx).toMatchObject({
      type: 'card_payment',
      source: 'sms',
      amount: 12_000_00,
      day: '2025-11-12',
    });
    expect(tx.smsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(getBalances(db).get(card)).toBe(0);
    expect(getBalances(db).get(bank)).toBe(38_000_00);
    expect(countInbox(db)).toBe(0);
    expect(() => acceptInboxItem(db, item!.id, { type: 'expense', accountId: bank })).toThrow();
    expect(() => acceptInboxItem(db, 'missing', { type: 'expense', accountId: bank })).toThrow();
  });

  it('dismisses, remembers the scan time and clears everything when turned off', () => {
    importSms(db, [sample('HDFC UPI sent'), sample('SBI credit')]);
    expect(getSettings(db).smsLastScanAt).toBe(RECEIVED);
    dismissInboxItem(db, listInbox(db)[0]!.id);
    expect(countInbox(db)).toBe(1);
    expect(listInbox(db, 'dismissed')).toHaveLength(1);
    mapLast4(db, '9999', bank);
    clearSmsData(db);
    expect(raw.prepare('select count(*) n from sms_inbox').get()).toEqual({ n: 0 });
    expect(getAccountMap(db).size).toBe(0);
    expect(getSettings(db)).toMatchObject({ smsEnabled: false, smsLastScanAt: null });
    expect(importSms(db, [])).toMatchObject({ read: 0, added: 0 });
  });
});
