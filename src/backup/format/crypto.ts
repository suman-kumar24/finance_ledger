/**
 * Optional passphrase encryption for backups.
 *
 *   key        scrypt(passphrase, salt, N = 2^15, r = 8, p = 1), 32 bytes
 *   cipher     AES-256-GCM with a random 12-byte nonce
 *   integrity  the GCM tag; the header fields are bound in as associated data
 *
 * Implemented with the audited pure-JavaScript @noble libraries, so it runs
 * the same on the phone and in tests and needs no native code.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

import { fromBase64, toBase64, utf8Decode } from './base64';

export const ENCRYPTED_FORMAT = 'ledger-encrypted';
export const ENCRYPTION_VERSION = 1;
export const KDF_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
export const MIN_PASSPHRASE_LENGTH = 8;

export interface EncryptedFile {
  format: typeof ENCRYPTED_FORMAT;
  version: number;
  /** Epoch ms of the backup inside; readable without the passphrase so restore can list it. */
  createdAt: number;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: { name: 'aes-256-gcm'; nonce: string };
  /** Base64 of ciphertext followed by the 16-byte tag. */
  data: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('The passphrase is wrong, or the file is damaged');
    this.name = 'WrongPassphraseError';
  }
}

export function isEncryptedFile(value: unknown): value is EncryptedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { format?: unknown }).format === ENCRYPTED_FORMAT &&
    typeof (value as { data?: unknown }).data === 'string'
  );
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: { N: number; r: number; p: number },
) {
  return scryptAsync(utf8ToBytes(passphrase.normalize('NFKC')), salt, { ...params, dkLen: 32 });
}

function associatedData(file: Pick<EncryptedFile, 'format' | 'version' | 'createdAt'>): Uint8Array {
  return utf8ToBytes(`${file.format}|${file.version}|${file.createdAt}`);
}

/**
 * Encrypts text. `randomBytes` must be a cryptographically secure source
 * (expo-crypto on the phone); it is passed in so this module stays pure.
 */
export async function encryptText(
  plaintext: string,
  passphrase: string,
  createdAt: number,
  randomBytes: (length: number) => Uint8Array,
  params: { N: number; r: number; p: number } = KDF_PARAMS,
): Promise<EncryptedFile> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error('Passphrase is too short');
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const header = { format: ENCRYPTED_FORMAT, version: ENCRYPTION_VERSION, createdAt } as const;
  const key = await deriveKey(passphrase, salt, params);
  const sealed = gcm(key, nonce, associatedData(header)).encrypt(utf8ToBytes(plaintext));
  return {
    ...header,
    kdf: { name: 'scrypt', ...params, salt: toBase64(salt) },
    cipher: { name: 'aes-256-gcm', nonce: toBase64(nonce) },
    data: toBase64(sealed),
  };
}

/** Decrypts a file made by `encryptText`. Throws WrongPassphraseError if the tag does not verify. */
export async function decryptText(file: EncryptedFile, passphrase: string): Promise<string> {
  if (
    file.version > ENCRYPTION_VERSION ||
    file.kdf?.name !== 'scrypt' ||
    file.cipher?.name !== 'aes-256-gcm'
  ) {
    throw new Error('This backup uses an encryption format this version of the app cannot read');
  }
  // Refuse absurd work factors from a hostile file.
  if (file.kdf.N > 2 ** 20 || file.kdf.r > 16 || file.kdf.p > 4)
    throw new Error('Unsupported key settings');
  const key = await deriveKey(passphrase, fromBase64(file.kdf.salt), file.kdf);
  try {
    const plain = gcm(key, fromBase64(file.cipher.nonce), associatedData(file)).decrypt(
      fromBase64(file.data),
    );
    return utf8Decode(plain);
  } catch {
    throw new WrongPassphraseError();
  }
}
