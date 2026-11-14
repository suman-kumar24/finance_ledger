/**
 * CSV reading and writing (RFC 4180): quoted fields, doubled quotes,
 * commas and line breaks inside quotes, CRLF or LF, optional BOM.
 */

/** Quotes a field when it needs it. Also neutralises spreadsheet formulas. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // A cell starting with = + - @ can run as a formula when the file is opened
  // in a spreadsheet; a leading apostrophe makes it plain text. Numbers are left alone.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Parses CSV text into rows of fields. Blank lines are skipped. */
export function parseCsv(input: string, delimiter = ','): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
    } else {
      field += ch;
    }
    i += 1;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Guesses the delimiter from the header line: comma, semicolon or tab. */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const candidates: [string, number][] = [
    [',', count(',')],
    [';', count(';')],
    ['\t', count('\t')],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0] && candidates[0][1] > 0 ? candidates[0][0] : ',';
}
