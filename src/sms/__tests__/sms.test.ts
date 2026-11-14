import fs from 'node:fs';
import path from 'node:path';

import data from '../data/patterns.json';
import {
  classifySms,
  cleanMerchant,
  cleanSender,
  findDuplicate,
  ignoreReason,
  isPersonalSender,
  parseSmsDate,
  PATTERN_IDS,
  smsHash,
  type ExistingEntry,
} from '../index';
import { IGNORED, RECEIVED, TRANSACTIONS } from '../testing/samples';

describe('bank alert parsing', () => {
  it.each(TRANSACTIONS.map((s) => [s.name, s] as const))('%s', (_name, sample) => {
    const verdict = classifySms(sample.sms);
    expect(verdict.kind).toBe('transaction');
    if (verdict.kind !== 'transaction') return;
    expect(verdict.parsed).toMatchObject(sample.expect);
    expect(Number.isSafeInteger(verdict.parsed.amount)).toBe(true);
    expect(verdict.parsed.occurredAt).toBe(RECEIVED);
  });

  it('uses an issuer pattern for the issuer formats and the fallback for the rest', () => {
    for (const sample of TRANSACTIONS) {
      const verdict = classifySms(sample.sms);
      if (verdict.kind !== 'transaction') throw new Error(sample.name);
      const generic = sample.name.startsWith('generic');
      expect(`${sample.name}:${verdict.parsed.patternId === 'generic'}`).toBe(
        `${sample.name}:${generic}`,
      );
    }
  });

  it('exercises every pattern in the data file', () => {
    const used = new Set(
      TRANSACTIONS.map((s) => {
        const v = classifySms(s.sms);
        return v.kind === 'transaction' ? v.parsed.patternId : '';
      }),
    );
    expect(PATTERN_IDS.filter((id) => !used.has(id))).toEqual([]);
  });

  it('keeps patterns in data, each with an amount group, and all of them compile', () => {
    expect(data.patterns.length).toBeGreaterThanOrEqual(15);
    for (const p of data.patterns) {
      expect(p.regex).toContain('(?<amount>');
      expect(() => new RegExp(p.regex, 'i')).not.toThrow();
      expect(['debit', 'credit']).toContain(p.direction);
    }
    expect(new Set(PATTERN_IDS).size).toBe(PATTERN_IDS.length);
  });

  it('returns structured fields only, never the message text', () => {
    for (const sample of TRANSACTIONS) {
      const verdict = classifySms(sample.sms);
      if (verdict.kind !== 'transaction') continue;
      expect(Object.keys(verdict.parsed).sort()).toEqual(
        [
          'amount',
          'balance',
          'billPayment',
          'day',
          'direction',
          'instrument',
          'last4',
          'merchant',
          'method',
          'occurredAt',
          'patternId',
          'sender',
        ].sort(),
      );
      for (const value of Object.values(verdict.parsed)) {
        if (typeof value === 'string') expect(value.length).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe('messages that must be ignored', () => {
  it.each(IGNORED.map((s) => [s.name, s] as const))('%s', (_name, sample) => {
    const verdict = classifySms(sample.sms);
    expect(verdict).toEqual({ kind: 'ignored', reason: sample.reason });
  });

  it('recognises personal senders and cleans bank sender ids', () => {
    expect(isPersonalSender('+91 90000 00000')).toBe(true);
    expect(isPersonalSender('VM-HDFCBK')).toBe(false);
    expect(isPersonalSender('56161')).toBe(false);
    expect(cleanSender('VM-HDFCBK')).toBe('HDFCBK');
    expect(cleanSender('ad-sbiinb-s')).toBe('SBIINB');
    expect(cleanSender('ICICIB')).toBe('ICICIB');
    expect(
      ignoreReason({ address: 'VM-HDFCBK', body: 'Rs 5 debited from a/c XX1234', date: RECEIVED }),
    ).toBeNull();
  });
});

describe('helpers', () => {
  it('reads alert dates and rejects ones far from receipt', () => {
    expect(parseSmsDate('12/11/25', RECEIVED)).toBe('2025-11-12');
    expect(parseSmsDate('12-Nov-25', RECEIVED)).toBe('2025-11-12');
    expect(parseSmsDate('12Nov25', RECEIVED)).toBe('2025-11-12');
    expect(parseSmsDate('2025-11-12:14:22:10', RECEIVED)).toBe('2025-11-12');
    expect(parseSmsDate('12 November 2025', RECEIVED)).toBe('2025-11-12');
    expect(parseSmsDate('11-11-2025', RECEIVED)).toBe('2025-11-11');
    expect(parseSmsDate('11/12/25', RECEIVED)).toBeNull(); // 11 December: not near receipt
    expect(parseSmsDate('31/02/25', RECEIVED)).toBeNull();
    expect(parseSmsDate('soon', RECEIVED)).toBeNull();
    expect(parseSmsDate(undefined, RECEIVED)).toBeNull();
  });

  it('tidies merchants', () => {
    expect(cleanMerchant(' CORNER  STORE. ')).toBe('CORNER STORE');
    expect(cleanMerchant('UPI/P2M/531200000007/CORNER STORE')).toBe('CORNER STORE');
    expect(cleanMerchant('ASHA VERMA Ref No 531200000004')).toBe('ASHA VERMA');
    expect(cleanMerchant('VPA: asha@oksbi')).toBe('asha@oksbi');
    expect(cleanMerchant('12345678')).toBeNull();
    expect(cleanMerchant('your')).toBeNull();
    expect(cleanMerchant(undefined)).toBeNull();
  });

  it('respects currencies without minor units', () => {
    const v = classifySms(
      { address: 'VM-BANK', body: 'INR 1,500 debited from A/c XX1234 on 12-11-25', date: RECEIVED },
      0,
    );
    expect(v.kind === 'transaction' && v.parsed.amount).toBe(1500);
  });
});

describe('de-duplication', () => {
  const sms = TRANSACTIONS[0]!.sms;

  it('hashes the same message identically and different ones differently', () => {
    expect(smsHash(sms)).toBe(smsHash({ ...sms, body: `  ${sms.body.replace(/ /g, '  ')} ` }));
    expect(smsHash(sms)).toMatch(/^[0-9a-f]{64}$/);
    expect(smsHash(sms)).not.toBe(smsHash({ ...sms, date: sms.date + 1000 }));
    expect(smsHash(sms)).not.toBe(smsHash({ ...sms, address: 'VM-OTHERB' }));
    expect(smsHash(sms)).not.toContain('CORNER');
  });

  const existing: ExistingEntry[] = [
    {
      id: 'manual',
      type: 'expense',
      amount: 250_00,
      day: '2025-11-12',
      accountId: 'bank',
      toAccountId: null,
    },
    {
      id: 'salary',
      type: 'income',
      amount: 85_000_00,
      day: '2025-11-01',
      accountId: 'bank',
      toAccountId: null,
    },
    {
      id: 'bill',
      type: 'card_payment',
      amount: 12_000_00,
      day: '2025-11-12',
      accountId: 'bank',
      toAccountId: 'card',
    },
    {
      id: 'fix',
      type: 'adjustment',
      amount: -70_00,
      day: '2025-11-12',
      accountId: 'bank',
      toAccountId: null,
    },
  ];

  it('finds an entry the user already added by hand', () => {
    expect(
      findDuplicate(
        { direction: 'debit', amount: 250_00, day: '2025-11-12', accountId: 'bank' },
        existing,
      )?.id,
    ).toBe('manual');
    expect(
      findDuplicate(
        { direction: 'debit', amount: 250_00, day: '2025-11-13', accountId: 'bank' },
        existing,
      )?.id,
    ).toBe('manual');
    expect(
      findDuplicate(
        { direction: 'debit', amount: 250_00, day: '2025-11-12', accountId: null },
        existing,
      )?.id,
    ).toBe('manual');
  });

  it('needs the same amount, account, direction and a nearby day', () => {
    expect(
      findDuplicate(
        { direction: 'debit', amount: 251_00, day: '2025-11-12', accountId: 'bank' },
        existing,
      ),
    ).toBeNull();
    expect(
      findDuplicate(
        { direction: 'debit', amount: 250_00, day: '2025-11-15', accountId: 'bank' },
        existing,
      ),
    ).toBeNull();
    expect(
      findDuplicate(
        { direction: 'debit', amount: 250_00, day: '2025-11-12', accountId: 'other' },
        existing,
      ),
    ).toBeNull();
    expect(
      findDuplicate(
        { direction: 'credit', amount: 250_00, day: '2025-11-12', accountId: 'bank' },
        existing,
      ),
    ).toBeNull();
    expect(
      findDuplicate(
        { direction: 'debit', amount: 250_00, day: '2025-11-14', accountId: 'bank' },
        existing,
        2,
      )?.id,
    ).toBe('manual');
  });

  it('matches both sides of a card bill payment and signed adjustments', () => {
    expect(
      findDuplicate(
        { direction: 'debit', amount: 12_000_00, day: '2025-11-12', accountId: 'bank' },
        existing,
      )?.id,
    ).toBe('bill');
    expect(
      findDuplicate(
        { direction: 'credit', amount: 12_000_00, day: '2025-11-12', accountId: 'card' },
        existing,
      )?.id,
    ).toBe('bill');
    expect(
      findDuplicate(
        { direction: 'debit', amount: 12_000_00, day: '2025-11-12', accountId: 'card' },
        existing,
      ),
    ).toBeNull();
    expect(
      findDuplicate(
        { direction: 'debit', amount: 70_00, day: '2025-11-12', accountId: 'bank' },
        existing,
      )?.id,
    ).toBe('fix');
    expect(
      findDuplicate(
        { direction: 'credit', amount: 85_000_00, day: '2025-11-01', accountId: 'bank' },
        existing,
      )?.id,
    ).toBe('salary');
  });

  it('prefers the closest day', () => {
    const two: ExistingEntry[] = [
      {
        id: 'far',
        type: 'expense',
        amount: 99_00,
        day: '2025-11-11',
        accountId: 'bank',
        toAccountId: null,
      },
      {
        id: 'near',
        type: 'expense',
        amount: 99_00,
        day: '2025-11-12',
        accountId: 'bank',
        toAccountId: null,
      },
    ];
    expect(
      findDuplicate(
        { direction: 'debit', amount: 99_00, day: '2025-11-12', accountId: 'bank' },
        two,
      )?.id,
    ).toBe('near');
  });
});

describe('sample hygiene', () => {
  it('uses only fake numbers', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', 'testing', 'samples.ts'), 'utf8');
    // Phone-like numbers are zero-padded placeholders; links point at .invalid.
    for (const m of text.matchAll(/\b[6-9]\d{9}\b/g)) expect(m[0]).toMatch(/0{5,}/);
    for (const m of text.matchAll(/https?:\/\/[^\s'"]+/g))
      expect(m[0]).toContain('example.invalid');
  });
});
