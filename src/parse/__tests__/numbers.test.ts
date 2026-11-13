import {
  ENGLISH_UNITS,
  FRACTION_MODIFIERS,
  FRACTION_UNITS,
  HINDI_UNITS,
  MULTIPLIERS,
} from '../data/numbers';
import { findNumbers, hundredthsToMinor, parseNumberPhrase } from '../numbers';
import { normalizeDevanagari, romanKey, titleCase, tokenize } from '../tokens';

const value = (text: string) => parseNumberPhrase(tokenize(text));

describe('number words', () => {
  it('has all of 1-99 in Hindi, in both scripts', () => {
    expect(HINDI_UNITS.map(([n]) => n)).toEqual(Array.from({ length: 99 }, (_, i) => i + 1));
    for (const [n, devanagari, roman] of HINDI_UNITS) {
      for (const word of [...devanagari, ...roman])
        expect(`${word}=${value(word + ' hazaar')}`).toBe(`${word}=${n * 1000 * 100}`);
    }
  });

  it('never maps one spelling to two different numbers', () => {
    const seen = new Map<string, number>();
    const check = (key: string, n: number) => {
      const before = seen.get(key);
      if (before !== undefined && before !== n)
        throw new Error(`"${key}" means both ${before} and ${n}`);
      seen.set(key, n);
    };
    for (const [n, dev, roman] of [
      ...HINDI_UNITS,
      ...MULTIPLIERS,
      ...FRACTION_UNITS,
      ...FRACTION_MODIFIERS,
    ]) {
      for (const word of dev) check(normalizeDevanagari(word), n);
      for (const word of roman) check(romanKey(word), n);
    }
    for (const [word, n] of Object.entries(ENGLISH_UNITS)) check(romanKey(word), n);
    expect(seen.size).toBeGreaterThan(300);
  });

  it.each([
    ['400', 400_00],
    ['1,200', 1_200_00],
    ['1200.50', 1_200_50],
    ['1.2k', 1_200_00],
    ['5k', 5_000_00],
    ['12 lakh', 12_00_000_00],
    ['1.5 lakh', 1_50_000_00],
    ['2 crore', 2_00_00_000_00],
    ['2.5cr', 2_50_00_000_00],
    ['3l', 3_00_000_00],
    ['2 lakh 50 hazaar', 2_50_000_00],
    ['5 sau', 500_00],
    ['०४००', 400_00],
    ['four hundred', 400_00],
    ['twenty five', 25_00],
    ['two hundred and fifty', 250_00],
    ['one thousand two hundred', 1_200_00],
    ['three lakh twenty thousand', 3_20_000_00],
    ['ninety nine', 99_00],
    ['fifteen hundred', 1_500_00],
    ['chaar sau', 400_00],
    ['char sau', 400_00],
    ['das hazaar', 10_000_00],
    ['das hazar', 10_000_00],
    ['pachpan hazaar ikyavan', 55_051_00],
    ['pachpan hajar ikyawan', 55_051_00],
    ['ek lakh', 1_00_000_00],
    ['do sau pachaas', 250_00],
    ['teen hazaar paanch sau', 3_500_00],
    ['saat sau', 700_00],
    ['saath', 60_00],
    ['dedh sau', 150_00],
    ['dhai hazaar', 2_500_00],
    ['saadhe teen sau', 350_00],
    ['saadhe paanch hazaar', 5_500_00],
    ['sawa sau', 125_00],
    ['paune do sau', 175_00],
    ['चार सौ', 400_00],
    ['दस हज़ार', 10_000_00],
    ['पचपन हजार इक्यावन', 55_051_00],
    ['डेढ़ सौ', 150_00],
    ['साढ़े तीन हजार', 3_500_00],
    ['पांच लाख', 5_00_000_00],
    ['पाँच सौ', 500_00],
    ['एक करोड़', 1_00_00_000_00],
    ['50 paise', 50],
    ['20 rupees 50 paise', 20_50],
    ['rupees 20 and 50 paise', 20_50],
    ['बीस रुपये पचास पैसे', 20_50],
    ['bees rupaye pachas paise', 20_50],
  ])('reads "%s"', (text, expected) => {
    expect(value(text)).toBe(expected);
  });

  it('does not read ordinary words as numbers', () => {
    expect(findNumbers(tokenize('do this so that'))).toEqual([]);
    expect(findNumbers(tokenize('bara ghar tera'))).toEqual([]);
    expect(findNumbers(tokenize('saadhe'))).toEqual([]);
    expect(findNumbers(tokenize('chai and phone'))).toEqual([]);
  });

  it('keeps separate numbers separate and notices currency marks', () => {
    const found = findNumbers(tokenize('2 pizza ₹400'));
    expect(found.map((n) => [n.hundredths, n.hasCurrency])).toEqual([
      [200, false],
      [400_00, true],
    ]);
    expect(findNumbers(tokenize('saath 500')).map((n) => n.hundredths)).toEqual([60_00, 500_00]);
    expect(findNumbers(tokenize('rs.250 for 3 tickets')).map((n) => n.hasCurrency)).toEqual([
      true,
      false,
    ]);
    expect(findNumbers(tokenize('400rs'))[0]).toMatchObject({
      hundredths: 400_00,
      hasCurrency: true,
    });
    expect(findNumbers(tokenize('1000 2000')).map((n) => n.hundredths)).toEqual([1000_00, 2000_00]);
    expect(findNumbers(tokenize('5 lakh 7 lakh')).map((n) => n.hundredths)).toEqual([
      5_00_000_00, 7_00_000_00,
    ]);
  });

  it('converts to minor units for other currencies', () => {
    expect(hundredthsToMinor(1_250_50, 2)).toBe(1_250_50);
    expect(hundredthsToMinor(1_250_50, 0)).toBe(1_251);
    expect(hundredthsToMinor(1_250_50, 3)).toBe(1_250_500);
  });

  it('normalises spelling', () => {
    expect(romanKey('Hazaar')).toBe(romanKey('hajar'));
    expect(romanKey('ikyawan')).toBe(romanKey('ikyavan'));
    expect(titleCase('corner shop')).toBe('Corner Shop');
    expect(tokenize('Paid ₹1,200/- at "Cafe".').map((t) => t.text)).toEqual([
      'paid',
      '₹',
      '1200',
      'at',
      'cafe',
    ]);
  });
});
