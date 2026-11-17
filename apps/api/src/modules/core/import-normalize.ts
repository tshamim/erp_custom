/**
 * Spreadsheet-tolerant value parsing for CSV imports.
 *
 * Most import files are edited in Excel, which rewrites what people typed: dates become
 * 7/1/2026 or 01-Jul-26, phone numbers lose their leading zero, long ID numbers turn into
 * 1.99012E+12, and enum columns arrive as "Daily Wage" instead of daily_wage. These helpers
 * turn the common shapes back into what the API expects, and fail with a message a person
 * can act on when they cannot.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31/02 and friends
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fullYear = (y: number) => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y);

/**
 * Date in any common spreadsheet shape → YYYY-MM-DD. Slash/dash/dot dates are read day-first,
 * as written in Bangladesh, unless the middle number cannot be a month (7/25/2026 is clearly
 * month-first). Excel serial day numbers (46204) are accepted too.
 */
export function normalizeDate(v: string | undefined): string | undefined {
  const s = (v ?? '').trim();
  if (!s) return undefined;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]) ?? s;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = fullYear(+m[3]);
    return (b > 12 ? valid(y, a, b) : valid(y, b, a)) ?? s;
  }
  m = /^(\d{1,2})[-\s/]([a-z]{3})[a-z]*[-\s/,]+(\d{2,4})$/i.exec(s);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return (mon && valid(fullYear(+m[3]), mon, +m[1])) || s;
  }
  m = /^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m) {
    const mon = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return (mon && valid(+m[3], mon, +m[2])) || s;
  }
  if (/^\d{5}$/.test(s)) {
    // Excel serial date: days since 1899-12-30.
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return dt.toISOString().slice(0, 10);
  }
  return s; // leave it for the schema to reject with "Expected YYYY-MM-DD"
}

/** "Daily Wage", "daily-wage", "DAILY WAGE" → daily_wage. */
export function normalizeEnum(v: string | undefined): string | undefined {
  const s = (v ?? '').trim();
  if (!s) return undefined;
  return s
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Gender as people write it: M / F / Male / female. */
export function normalizeGender(v: string | undefined): string | undefined {
  const s = normalizeEnum(v);
  if (!s) return undefined;
  if (s === 'm') return 'male';
  if (s === 'f') return 'female';
  return s;
}

/** Excel drops the leading zero of a Bangladeshi mobile number: 1711000000 → 01711000000. */
export function normalizePhone(v: string | undefined): string | undefined {
  const s = (v ?? '').trim();
  if (!s) return undefined;
  if (/^1[3-9]\d{8}$/.test(s)) return `0${s}`;
  if (/^8801[3-9]\d{8}$/.test(s)) return `+${s}`;
  return s;
}

/**
 * A long number column (NID, bank account) that Excel has shown in scientific notation has lost
 * its digits for good; refuse it rather than store a wrong number.
 */
export function longNumber(v: string | undefined, what: string): string | undefined {
  const s = (v ?? '').trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) {
    throw new Error(`${what} "${s}" was shortened by Excel — format that column as Text and type the full number again`);
  }
  return s;
}

/** Amount as typed in a spreadsheet: "1,250.00", "৳ 900", " 900 " → 1250.00 / 900. */
export function normalizeAmount(v: string | undefined): string | undefined {
  const s = (v ?? '').trim();
  if (!s) return undefined;
  const cleaned = s.replace(/[,\s৳]|tk\.?|bdt/gi, '');
  return cleaned === '' ? undefined : cleaned;
}
