import { longNumber, normalizeAmount, normalizeDate, normalizeEnum, normalizeGender, normalizePhone } from './import-normalize';

describe('import value normalisation', () => {
  it('reads the date shapes Excel produces, day first as written in Bangladesh', () => {
    expect(normalizeDate('2026-07-01')).toBe('2026-07-01');
    expect(normalizeDate('2026/7/1')).toBe('2026-07-01');
    expect(normalizeDate('01/07/2026')).toBe('2026-07-01');
    expect(normalizeDate('1-7-2026')).toBe('2026-07-01');
    expect(normalizeDate('01.07.26')).toBe('2026-07-01');
    expect(normalizeDate('7/25/2026')).toBe('2026-07-25'); // 25 cannot be a month
    expect(normalizeDate('1-Jul-26')).toBe('2026-07-01');
    expect(normalizeDate('01 July 2026')).toBe('2026-07-01');
    expect(normalizeDate('Jul 1, 2026')).toBe('2026-07-01');
    expect(normalizeDate('46204')).toBe('2026-07-01'); // Excel serial
    expect(normalizeDate('2026-07-01 00:00:00')).toBe('2026-07-01');
  });

  it('leaves an impossible date for the schema to reject', () => {
    expect(normalizeDate('31/02/2026')).toBe('31/02/2026');
    expect(normalizeDate('next week')).toBe('next week');
    expect(normalizeDate('  ')).toBeUndefined();
  });

  it('turns words into enum values', () => {
    expect(normalizeEnum('Daily Wage')).toBe('daily_wage');
    expect(normalizeEnum('daily-wage')).toBe('daily_wage');
    expect(normalizeEnum('PERMANENT')).toBe('permanent');
    expect(normalizeGender('M')).toBe('male');
    expect(normalizeGender('Female')).toBe('female');
  });

  it('puts back the leading zero Excel drops from a mobile number', () => {
    expect(normalizePhone('1711000000')).toBe('01711000000');
    expect(normalizePhone('01711000000')).toBe('01711000000');
    expect(normalizePhone('8801711000000')).toBe('+8801711000000');
    expect(normalizePhone('02-9123456')).toBe('02-9123456');
  });

  it('refuses a long number Excel has shortened to scientific notation', () => {
    expect(() => longNumber('1.99012E+12', 'NID')).toThrow(/format that column as Text/);
    expect(longNumber('1990123456789', 'NID')).toBe('1990123456789');
  });

  it('strips thousands separators and currency from amounts', () => {
    expect(normalizeAmount('1,250.00')).toBe('1250.00');
    expect(normalizeAmount('৳ 900')).toBe('900');
    expect(normalizeAmount('Tk 900')).toBe('900');
    expect(normalizeAmount('')).toBeUndefined();
  });
});
