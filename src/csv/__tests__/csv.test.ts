import type { Transaction } from '@/domain/types';

import {
  csvField,
  detectDateOrder,
  detectDelimiter,
  guessMapping,
  mapRows,
  parseAmountCell,
  parseCsv,
  parseDateCell,
  parseTypeCell,
  signedAmount,
  toCsv,
  transactionsToCsv,
  type ImportContext,
} from '../index';

describe('CSV reading and writing', () => {
  it('quotes only when needed and round-trips awkward text', () => {
    const rows = [
      ['plain', 'has,comma', 'has "quotes"', 'line\nbreak', ''],
      ['हिन्दी', ' spaced ', '12.50', '-7', '0'],
    ];
    const text = toCsv(rows);
    expect(text.startsWith('plain,"has,comma","has ""quotes""","line\nbreak",\r\n')).toBe(true);
    expect(parseCsv(text)).toEqual(rows);
  });

  it('reads CRLF, LF, a BOM, blank lines and a missing final newline', () => {
    expect(parseCsv('﻿a,b\r\n1,2\n\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseCsv('a;b\n"x;y";z', ';')).toEqual([
      ['a', 'b'],
      ['x;y', 'z'],
    ]);
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,\n')).toEqual([['a', '']]);
  });

  it('neutralises spreadsheet formulas but leaves numbers alone', () => {
    expect(csvField('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvField('@cmd')).toBe("'@cmd");
    expect(csvField('-45.00')).toBe('-45.00');
    expect(csvField(-45)).toBe('-45');
    expect(csvField('+91 dial')).toBe("'+91 dial");
    expect(csvField(null)).toBe('');
  });

  it('detects the delimiter', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('a,b\n1,2')).toBe(',');
    expect(detectDelimiter('single')).toBe(',');
  });
});

describe('export', () => {
  const tx = (extra: Partial<Transaction>): Transaction => ({
    id: 't1',
    type: 'expense',
    amount: 1_234_50,
    occurredAt: new Date(2025, 10, 12, 9, 5).getTime(),
    day: '2025-11-12',
    accountId: 'bank',
    toAccountId: null,
    categoryId: 'dining',
    payee: 'Blue, Cafe',
    method: 'upi',
    note: null,
    tags: ['work', 'lunch'],
    status: 'cleared',
    source: 'manual',
    smsHash: null,
    recurringRuleId: null,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  });
  const ctx = {
    accounts: new Map([
      ['bank', { name: 'Bank', currency: 'INR' }],
      ['fund', { name: 'Fund', currency: 'INR' }],
    ]),
    categories: new Map([
      ['food', { name: 'Food', parentId: null }],
      ['dining', { name: 'Dining', parentId: 'food' }],
    ]),
    decimals: 2,
    currency: 'INR',
  };

  it('writes exact decimals, signs, and parent and sub categories', () => {
    const csv = transactionsToCsv(
      [
        tx({}),
        tx({ id: 't2', type: 'transfer', toAccountId: 'fund', categoryId: null, amount: 5_000_00 }),
      ],
      ctx,
    );
    const rows = parseCsv(csv);
    expect(rows[0]).toContain('Signed amount');
    expect(rows[1]).toEqual([
      '2025-11-12',
      '09:05',
      'expense',
      '1234.50',
      '-1234.50',
      'INR',
      'Bank',
      '',
      'Food',
      'Dining',
      'Blue, Cafe',
      'upi',
      '',
      'work; lunch',
      'cleared',
      'manual',
      't1',
    ]);
    expect(rows[2]?.slice(2, 8)).toEqual([
      'transfer',
      '5000.00',
      '-5000.00',
      'INR',
      'Bank',
      'Fund',
    ]);
  });

  it('signs each type', () => {
    expect(signedAmount({ type: 'income', amount: 5 })).toBe(5);
    expect(signedAmount({ type: 'refund', amount: 5 })).toBe(5);
    expect(signedAmount({ type: 'adjustment', amount: -5 })).toBe(-5);
    expect(signedAmount({ type: 'card_payment', amount: 5 })).toBe(-5);
  });
});

describe('import', () => {
  const ctx: ImportContext = {
    accountsByName: new Map([
      ['bank', 'bank'],
      ['fund', 'fund'],
      ['card', 'card'],
    ]),
    categoriesByName: new Map([
      ['food', { id: 'food', kind: 'expense' }],
      ['salary', { id: 'salary', kind: 'income' }],
    ]),
    defaultAccountId: 'bank',
    decimals: 2,
    dateOrder: 'dmy',
    today: '2025-11-13',
  };

  it('guesses column mapping from common header names', () => {
    expect(
      guessMapping(['Txn Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Balance']),
    ).toMatchObject({
      date: 0,
      payee: 1,
      debit: 2,
      credit: 3,
      amount: null,
    });
    const own = guessMapping([
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
    ]);
    expect(own).toMatchObject({
      date: 0,
      type: 2,
      amount: 4,
      account: 6,
      toAccount: 7,
      category: 8,
      payee: 10,
      method: 11,
      note: 12,
      tags: 13,
    });
  });

  it('reads dates in common formats', () => {
    expect(parseDateCell('2025-11-12')).toBe('2025-11-12');
    expect(parseDateCell('12/11/2025')).toBe('2025-11-12');
    expect(parseDateCell('12/11/2025', 'mdy')).toBe('2025-12-11');
    expect(parseDateCell('12-Nov-25')).toBe('2025-11-12');
    expect(parseDateCell('12 November 2025')).toBe('2025-11-12');
    expect(parseDateCell('Nov 12, 2025')).toBe('2025-11-12');
    expect(parseDateCell('2025-11-12 14:22:10')).toBe('2025-11-12');
    expect(parseDateCell('31/02/2025')).toBeNull();
    expect(parseDateCell('soon')).toBeNull();
    expect(parseDateCell('')).toBeNull();
    expect(detectDateOrder(['01/02/2025', '13/02/2025'])).toBe('dmy');
    expect(detectDateOrder(['02/13/2025', '02/01/2025'])).toBe('mdy');
    expect(detectDateOrder(['01/02/2025'])).toBe('dmy');
  });

  it('reads amounts and types', () => {
    expect(parseAmountCell('1,234.50')).toBe(1_234_50);
    expect(parseAmountCell('(500.00)')).toBe(-500_00);
    expect(parseAmountCell('500 Dr')).toBe(-500_00);
    expect(parseAmountCell('500.00 CR')).toBe(500_00);
    expect(parseAmountCell('₹ 99')).toBe(99_00);
    expect(parseAmountCell('-45')).toBe(-45_00);
    expect(parseAmountCell('')).toBeNull();
    expect(parseAmountCell('n/a')).toBeNull();
    expect(parseTypeCell('Withdrawal')).toBe('expense');
    expect(parseTypeCell('CR')).toBe('income');
    expect(parseTypeCell('Card payment')).toBe('card_payment');
    expect(parseTypeCell('???')).toBeNull();
  });

  it('maps a bank statement with debit and credit columns', () => {
    const mapping = guessMapping(['Date', 'Narration', 'Withdrawal', 'Deposit']);
    const rows = [
      ['12/11/2025', 'UPI-CORNER STORE', '250.00', ''],
      ['01/11/2025', 'SALARY NOV', '', '85,000.00'],
      ['bad date', 'x', '1', ''],
      ['02/11/2025', 'nothing', '', ''],
      ['03/11/2025', 'zero', '0.00', '0'],
    ];
    const result = mapRows(rows, mapping, ctx);
    expect(result.drafts).toMatchObject([
      {
        line: 1,
        type: 'expense',
        amount: 250_00,
        day: '2025-11-12',
        accountId: 'bank',
        payee: 'UPI-CORNER STORE',
      },
      { line: 2, type: 'income', amount: 85_000_00, day: '2025-11-01' },
    ]);
    expect(result.skipped).toEqual([
      { line: 3, problem: 'no_date' },
      { line: 4, problem: 'no_amount' },
      { line: 5, problem: 'zero_amount' },
    ]);
  });

  it('maps a ledger export with types, accounts, categories and tags', () => {
    const headers = [
      'Date',
      'Type',
      'Signed amount',
      'Account',
      'To account',
      'Category',
      'Payee',
      'Method',
      'Note',
      'Tags',
    ];
    const rows = [
      [
        '2025-11-12',
        'expense',
        '-1234.50',
        'Bank',
        '',
        'Food',
        'Blue Cafe',
        'upi',
        'team lunch',
        'work; lunch',
      ],
      ['2025-11-05', 'transfer', '-5000.00', 'Bank', 'Fund', '', 'SIP', '', '', ''],
      ['2025-11-06', 'card_payment', '-900.00', 'Bank', 'Card', '', '', '', '', ''],
      ['2025-11-07', 'transfer', '-10.00', 'Bank', 'Nowhere', '', '', '', '', ''],
      ['2025-11-08', 'adjustment', '-75.00', 'Bank', '', '', 'Unmatched', '', '', ''],
      ['2025-11-09', '', '300', 'Unknown bank', '', 'Pets', 'Vet', 'bitcoin', '', ''],
      ['2025-11-10', '', '-40.00', 'Bank', '', 'Salary', '', '', '', ''],
    ];
    const result = mapRows(rows, guessMapping(headers), ctx);
    expect(result.drafts).toMatchObject([
      {
        type: 'expense',
        amount: 1_234_50,
        categoryId: 'food',
        method: 'upi',
        note: 'team lunch',
        tags: ['work', 'lunch'],
      },
      { type: 'transfer', amount: 5_000_00, toAccountId: 'fund', categoryId: null },
      { type: 'card_payment', amount: 900_00, toAccountId: 'card' },
      { type: 'adjustment', amount: -75_00 },
      {
        type: 'income',
        amount: 300_00,
        accountId: 'bank',
        categoryId: null,
        unknownCategory: 'Pets',
        method: null,
      },
      { type: 'income', amount: 40_00, categoryId: 'salary' },
    ]);
    expect(result.skipped).toEqual([{ line: 4, problem: 'no_destination' }]);
    expect(result.unknownCategories).toEqual(['Pets']);
  });

  it('needs an account from the file or a default', () => {
    const result = mapRows(
      [['2025-11-12', '5']],
      { ...guessMapping(['Date', 'Amount']) },
      { ...ctx, defaultAccountId: null },
    );
    expect(result.skipped).toEqual([{ line: 1, problem: 'no_account' }]);
  });
});
