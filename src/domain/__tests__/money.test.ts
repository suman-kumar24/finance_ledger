import {
  allocate,
  assertMinor,
  currencyInfo,
  formatCompact,
  formatMoney,
  fromMajor,
  groupDigits,
  isMinor,
  mulDiv,
  normalizeDigits,
  parseAmount,
  percentFloor,
  ratio,
  roundToMajor,
  splitMinor,
  sum,
  toDecimalString,
} from '../money';

describe('parseAmount', () => {
  it.each([
    ['1200', 120000],
    ['1,200', 120000],
    ['1,20,000.50', 12000050],
    ['₹ 99.9', 9990],
    ['Rs. 45', 4500],
    ['0.01', 1],
    ['.5', 50],
    ['12.', 1200],
    ['-45', -4500],
    ['+45', 4500],
    ['१२०', 12000],
    ['  7  ', 700],
    ['0', 0],
    ['-0', 0],
    ['100 only', 10000],
  ])('parses %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('rounds extra decimals half-up without float error', () => {
    expect(parseAmount('1.005')).toBe(101);
    expect(parseAmount('1.004')).toBe(100);
    expect(parseAmount('0.295')).toBe(30);
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('0.1')! + parseAmount('0.2')!).toBe(30);
  });

  it.each(['', 'abc', '1.2.3', '--5', '1e5', '12a34'])('rejects %p', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('respects currencies without minor units', () => {
    expect(parseAmount('1500', 0)).toBe(1500);
    expect(parseAmount('1500.6', 0)).toBe(1501);
  });

  it('rejects numbers beyond the safe range', () => {
    expect(parseAmount('99999999999999999')).toBeNull();
  });

  it('handles crores exactly', () => {
    expect(parseAmount('12,34,56,789.01')).toBe(12345678901);
  });
});

describe('formatMoney', () => {
  it('uses lakh/crore grouping for INR', () => {
    expect(formatMoney(12345650)).toBe('₹1,23,456.50');
    expect(formatMoney(1234567890123)).toBe('₹12,34,56,78,901.23');
    expect(formatMoney(100000)).toBe('₹1,000');
    expect(formatMoney(99)).toBe('₹0.99');
    expect(formatMoney(0)).toBe('₹0');
  });

  it('uses western grouping when asked', () => {
    expect(formatMoney(123456789, { currency: 'USD' })).toBe('$1,234,567.89');
    expect(formatMoney(123456789, { grouping: 'western' })).toBe('₹1,234,567.89');
    expect(formatMoney(123456789, { grouping: 'none' })).toBe('₹1234567.89');
  });

  it('controls fraction display', () => {
    expect(formatMoney(150000, { fraction: 'always' })).toBe('₹1,500.00');
    expect(formatMoney(150050, { fraction: 'never' })).toBe('₹1,501');
    expect(formatMoney(150049, { fraction: 'never' })).toBe('₹1,500');
    expect(formatMoney(-150050, { fraction: 'never' })).toBe('-₹1,501');
  });

  it('controls sign and symbol', () => {
    expect(formatMoney(-2500)).toBe('-₹25');
    expect(formatMoney(2500, { sign: 'always' })).toBe('+₹25');
    expect(formatMoney(0, { sign: 'always' })).toBe('₹0');
    expect(formatMoney(-2500, { sign: 'never' })).toBe('₹25');
    expect(formatMoney(2500, { symbol: false })).toBe('25');
  });

  it('handles zero-decimal and unknown currencies', () => {
    expect(formatMoney(1500, { currency: 'JPY' })).toBe('¥1,500');
    expect(formatMoney(1500, { currency: 'XYZ' })).toBe('XYZ 15');
    expect(currencyInfo('XYZ').decimals).toBe(2);
  });
});

describe('formatCompact', () => {
  it('uses K, L and Cr for Indian grouping', () => {
    expect(formatCompact(50000)).toBe('₹500');
    expect(formatCompact(150000)).toBe('₹1.5K');
    expect(formatCompact(12000000)).toBe('₹1.2L');
    expect(formatCompact(3450000000)).toBe('₹3.45Cr');
    expect(formatCompact(10000000)).toBe('₹1L');
    expect(formatCompact(-12000000)).toBe('-₹1.2L');
  });

  it('uses K, M and B for western grouping', () => {
    expect(formatCompact(150000000, { currency: 'USD' })).toBe('$1.5M');
    expect(formatCompact(250000000000, { currency: 'USD' })).toBe('$2.5B');
    expect(formatCompact(99900, { currency: 'USD' })).toBe('$999');
  });
});

describe('integer helpers', () => {
  it('groups digits', () => {
    expect(groupDigits('1234567', 'indian')).toBe('12,34,567');
    expect(groupDigits('1234567', 'western')).toBe('1,234,567');
    expect(groupDigits('123', 'indian')).toBe('123');
    expect(groupDigits('1234', 'indian')).toBe('1,234');
    expect(groupDigits('100000', 'indian')).toBe('1,00,000');
  });

  it('normalises Devanagari digits', () => {
    expect(normalizeDigits('४००')).toBe('400');
  });

  it('validates minor units', () => {
    expect(isMinor(10)).toBe(true);
    expect(isMinor(10.5)).toBe(false);
    expect(isMinor('10')).toBe(false);
    expect(() => assertMinor(0.1)).toThrow();
    expect(assertMinor(5)).toBe(5);
  });

  it('builds from major units', () => {
    expect(fromMajor(12, 34)).toBe(1234);
    expect(fromMajor(-12, 34)).toBe(-1234);
    expect(fromMajor(5, 0, 0)).toBe(5);
    expect(() => fromMajor(1.5)).toThrow();
  });

  it('splits minor units', () => {
    expect(splitMinor(-1205, 2)).toEqual({ negative: true, whole: '12', fraction: '05' });
    expect(splitMinor(7, 2)).toEqual({ negative: false, whole: '0', fraction: '07' });
    expect(splitMinor(7, 0)).toEqual({ negative: false, whole: '7', fraction: '' });
  });

  it('sums exactly', () => {
    expect(sum([10, 20, 30])).toBe(60);
    expect(sum([])).toBe(0);
    // 0.1 + 0.2 in paise never drifts
    expect(sum(Array.from({ length: 1000 }, () => 10))).toBe(10000);
  });

  it('multiplies by a ratio with exact rounding', () => {
    expect(mulDiv(1000, 1, 3)).toBe(333);
    expect(mulDiv(1000, 2, 3)).toBe(667);
    expect(mulDiv(-1000, 2, 3)).toBe(-667);
    expect(mulDiv(5, 1, 2)).toBe(3);
    expect(mulDiv(900000000000000, 80, 100)).toBe(720000000000000);
    expect(() => mulDiv(1, 1, 0)).toThrow();
    expect(() => mulDiv(1, 0.5, 1)).toThrow();
  });

  it('allocates without losing a paisa', () => {
    expect(allocate(1000, 3)).toEqual([334, 333, 333]);
    expect(sum(allocate(1001, 7))).toBe(1001);
    expect(allocate(-1000, 3)).toEqual([-334, -333, -333]);
    expect(() => allocate(100, 0)).toThrow();
  });

  it('computes ratios and percentages', () => {
    expect(ratio(50, 200)).toBe(0.25);
    expect(ratio(50, 0)).toBe(0);
    expect(percentFloor(799, 1000)).toBe(79);
    expect(percentFloor(800, 1000)).toBe(80);
    expect(percentFloor(5, 0)).toBe(0);
  });

  it('rounds to major units', () => {
    expect(roundToMajor(149)).toBe(100);
    expect(roundToMajor(150)).toBe(200);
    expect(roundToMajor(-150)).toBe(-200);
  });

  it('writes decimal strings for CSV', () => {
    expect(toDecimalString(123450)).toBe('1234.50');
    expect(toDecimalString(-5)).toBe('-0.05');
    expect(toDecimalString(500, 0)).toBe('500');
  });
});
