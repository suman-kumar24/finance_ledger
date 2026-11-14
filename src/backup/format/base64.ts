/** Base64 without relying on Buffer, btoa or atob (none are guaranteed on every JS engine). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((ch, i) => [ch, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET.charAt(a >> 2);
    out += ALPHABET.charAt(((a & 3) << 4) | ((b ?? 0) >> 4));
    out += b === undefined ? '=' : ALPHABET.charAt(((b & 15) << 2) | ((c ?? 0) >> 6));
    out += c === undefined ? '=' : ALPHABET.charAt(c & 63);
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[\s=]+/g, '');
  if (clean.length % 4 === 1) throw new Error('Invalid base64');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => {
      const ch = clean.charAt(i + k);
      if (ch === '') return -1;
      const n = LOOKUP.get(ch);
      if (n === undefined) throw new Error('Invalid base64');
      return n;
    }) as [number, number, number, number];
    out[o++] = (v[0] << 2) | (Math.max(v[1], 0) >> 4);
    if (v[2] >= 0) out[o++] = ((v[1] & 15) << 4) | (v[2] >> 2);
    if (v[3] >= 0) out[o++] = ((v[2] & 3) << 6) | v[3];
  }
  return out.subarray(0, o);
}

/** UTF-8 bytes to a string, without TextDecoder (not present on every JS engine). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let chunk: number[] = [];
  const flush = () => {
    out += String.fromCodePoint(...chunk);
    chunk = [];
  };
  for (let i = 0; i < bytes.length;) {
    const b0 = bytes[i] ?? 0;
    let code: number;
    let size: number;
    if (b0 < 0x80) [code, size] = [b0, 1];
    else if (b0 >= 0xc0 && b0 < 0xe0) [code, size] = [b0 & 0x1f, 2];
    else if (b0 >= 0xe0 && b0 < 0xf0) [code, size] = [b0 & 0x0f, 3];
    else if (b0 >= 0xf0 && b0 < 0xf8) [code, size] = [b0 & 0x07, 4];
    else [code, size] = [0xfffd, 1];
    for (let k = 1; k < size; k += 1) code = (code << 6) | ((bytes[i + k] ?? 0) & 0x3f);
    chunk.push(code > 0x10ffff ? 0xfffd : code);
    if (chunk.length >= 4096) flush();
    i += size;
  }
  flush();
  return out;
}
