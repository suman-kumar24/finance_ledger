import { randomBytes } from 'node:crypto';

import { fromBase64, toBase64, utf8Decode } from '../base64';
import { decryptText, encryptText, isEncryptedFile, WrongPassphraseError } from '../crypto';
import {
  backupFileName,
  backupsToDelete,
  BACKUP_TABLES,
  buildSnapshot,
  parseSnapshot,
  SnapshotError,
  validateSnapshot,
  type BackupData,
} from '../snapshot';

const random = (n: number) => new Uint8Array(randomBytes(n));
/** Small work factor so tests are quick; the app uses N = 2^15. */
const FAST = { N: 2 ** 10, r: 8, p: 1 };

function emptyData(): BackupData {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, []])) as unknown as BackupData;
}

describe('base64', () => {
  it('round-trips every length and matches the standard encoding', () => {
    for (let n = 0; n < 40; n += 1) {
      const bytes = random(n);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
      expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
    }
    expect(() => fromBase64('a')).toThrow();
    expect(() => fromBase64('!!!!')).toThrow();
  });

  it('decodes UTF-8 including Devanagari, symbols and emoji', () => {
    const text = 'Rent ₹15,000 किराया café 😀 ' + 'x'.repeat(5000);
    expect(utf8Decode(new TextEncoder().encode(text))).toBe(text);
    expect(utf8Decode(new Uint8Array())).toBe('');
  });
});

describe('backup file', () => {
  it('carries a schema version and counts', () => {
    const data = emptyData();
    data.accounts.push({ id: 'a', openingBalance: 5 });
    data.transactions.push({ id: 't', amount: 100 }, { id: 'u', amount: -5 });
    const file = buildSnapshot(data, 1_700_000_000_000, '1.0.0');
    expect(file).toMatchObject({
      app: 'ledger',
      schemaVersion: 1,
      counts: { accounts: 1, transactions: 2 },
    });
    expect(parseSnapshot(JSON.stringify(file))).toEqual(file);
  });

  it('rejects files it cannot safely restore', () => {
    const good = buildSnapshot(emptyData(), 1, '1.0.0');
    const problem = (value: unknown) => {
      try {
        validateSnapshot(value);
        return 'ok';
      } catch (e) {
        return e instanceof SnapshotError ? e.problem : 'other';
      }
    };
    expect(problem(good)).toBe('ok');
    expect(problem(null)).toBe('not_a_backup');
    expect(problem({ ...good, app: 'other' })).toBe('not_a_backup');
    expect(problem({ ...good, data: null })).toBe('not_a_backup');
    expect(problem({ ...good, schemaVersion: 99 })).toBe('newer_version');
    expect(problem({ ...good, data: { ...good.data, goals: undefined } })).toBe('missing_table');
    expect(problem({ ...good, data: { ...good.data, goals: [1] } })).toBe('bad_rows');
    expect(problem({ ...good, data: { ...good.data, transactions: [{ amount: 10.5 }] } })).toBe(
      'bad_money',
    );
    expect(problem({ ...good, data: { ...good.data, accounts: [{ openingBalance: '5' }] } })).toBe(
      'bad_money',
    );
    expect(() => parseSnapshot('{nope')).toThrow(SnapshotError);
  });

  it('recomputes counts instead of trusting the file', () => {
    const file = buildSnapshot(emptyData(), 1, '1.0.0');
    const lying = { ...file, counts: { ...file.counts, transactions: 999 }, appVersion: 5 };
    expect(validateSnapshot(lying)).toMatchObject({
      counts: { transactions: 0 },
      appVersion: 'unknown',
    });
  });

  it('names files so they sort by time, and keeps the last 7', () => {
    expect(backupFileName(new Date(2025, 10, 13, 14, 22, 10).getTime())).toBe(
      'ledger-backup-20251113-142210.json',
    );
    const files = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, createdTime: i }));
    expect(backupsToDelete(files).map((f) => f.id)).toEqual(['f2', 'f1', 'f0']);
    expect(backupsToDelete(files.slice(0, 7))).toEqual([]);
    expect(backupsToDelete(files, 9).map((f) => f.id)).toEqual(['f0']);
  });
});

describe('encryption (AES-256-GCM, scrypt)', () => {
  const secret = JSON.stringify({ hello: 'दुनिया', amount: 12345678901 });

  it('round-trips with the right passphrase', async () => {
    const file = await encryptText(secret, 'correct horse battery', 1234, random, FAST);
    expect(isEncryptedFile(file)).toBe(true);
    expect(file).toMatchObject({
      format: 'ledger-encrypted',
      createdAt: 1234,
      kdf: { name: 'scrypt', N: 1024 },
      cipher: { name: 'aes-256-gcm' },
    });
    expect(JSON.stringify(file)).not.toContain('hello');
    expect(await decryptText(file, 'correct horse battery')).toBe(secret);
  });

  it('fails with the wrong passphrase or a tampered file', async () => {
    const file = await encryptText(secret, 'correct horse battery', 1234, random, FAST);
    await expect(decryptText(file, 'wrong horse battery')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    const bytes = fromBase64(file.data);
    bytes[3] = (bytes[3] ?? 0) ^ 1;
    await expect(
      decryptText({ ...file, data: toBase64(bytes) }, 'correct horse battery'),
    ).rejects.toBeInstanceOf(WrongPassphraseError);
    // The header is authenticated too.
    await expect(
      decryptText({ ...file, createdAt: 9999 }, 'correct horse battery'),
    ).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('uses a fresh salt and nonce every time', async () => {
    const a = await encryptText(secret, 'correct horse battery', 1, random, FAST);
    const b = await encryptText(secret, 'correct horse battery', 1, random, FAST);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.nonce).not.toBe(b.cipher.nonce);
    expect(a.data).not.toBe(b.data);
  });

  it('refuses weak passphrases and hostile or unknown formats', async () => {
    await expect(encryptText(secret, 'short', 1, random, FAST)).rejects.toThrow();
    const file = await encryptText(secret, 'correct horse battery', 1, random, FAST);
    await expect(decryptText({ ...file, version: 99 }, 'correct horse battery')).rejects.toThrow(
      /cannot read/,
    );
    await expect(
      decryptText({ ...file, kdf: { ...file.kdf, N: 2 ** 30 } }, 'correct horse battery'),
    ).rejects.toThrow(/Unsupported/);
    expect(isEncryptedFile({ format: 'x' })).toBe(false);
    expect(isEncryptedFile(null)).toBe(false);
  });

  it('works at the production work factor', async () => {
    const file = await encryptText('x', 'correct horse battery', 1, random);
    expect(file.kdf.N).toBe(32768);
    expect(await decryptText(file, 'correct horse battery')).toBe('x');
  });
});
