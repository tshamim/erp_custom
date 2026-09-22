import { annualTax, computePayslip, TaxSlab } from './payroll/payroll.calc';
import { computeRaBill } from './construction/site.service';
import { rollupProgress } from './construction/projects.service';
import { countLeaveDays } from './hr/attendance-leave.service';
import { computeLines } from './finance/documents.service';

const SLABS: TaxSlab[] = [
  { upTo: 350000, rate: 0 },
  { upTo: 450000, rate: 5 },
  { upTo: 850000, rate: 10 },
  { upTo: 1350000, rate: 15 },
  { upTo: 1850000, rate: 20 },
  { upTo: 3850000, rate: 25 },
  { upTo: null, rate: 30 },
];

describe('income tax slabs', () => {
  it('is zero below the threshold', () => {
    expect(annualTax(300000, SLABS, 5000).toFixed(2)).toBe('0.00');
  });
  it('applies progressive rates', () => {
    // 100k @5% + 150k @10% = 5,000 + 15,000
    expect(annualTax(600000, SLABS).toFixed(2)).toBe('20000.00');
  });
  it('applies minimum tax when some tax is due', () => {
    expect(annualTax(360000, SLABS, 5000).toFixed(2)).toBe('5000.00');
  });
  it('taxes the open top slab', () => {
    // 5k + 40k + 75k + 100k + 500k = 720k, + 150k × 30%
    expect(annualTax(4000000, SLABS).toFixed(2)).toBe('765000.00');
  });
});

describe('payslip', () => {
  const base = {
    employmentType: 'permanent',
    basic: '30000',
    houseRent: '15000',
    medical: '3000',
    conveyance: '2000',
    otherAllowance: '0',
    pfPercent: '10',
    overtimeRatePerHour: '0',
    taxEnabled: true,
    workingDays: 26,
    presentDays: 26,
    unpaidDays: 0,
    overtimeHours: 0,
    includeFestivalBonus: false,
    festivalBonusPercent: '100',
    slabs: SLABS,
    exemptionCap: '450000',
    minimumTax: '5000',
  };

  it('computes a monthly staff payslip', () => {
    const p = computePayslip(base);
    expect(p.gross.toFixed(2)).toBe('50000.00');
    expect(p.pfEmployee.toFixed(2)).toBe('3000.00');
    // annual 600k + 60k bonus = 660k; exemption min(220k, 450k) = 220k; taxable 440k → 4,500 → min tax 5,000 → /12
    expect(p.tds.toFixed(2)).toBe('416.67');
    expect(p.netPay.toFixed(2)).toBe('46583.33');
  });

  it('deducts absence at basic/30 per day and pays overtime at 2 × basic/208', () => {
    const p = computePayslip({ ...base, unpaidDays: 2, overtimeHours: 10, taxEnabled: false, pfPercent: '0' });
    expect(p.absentDeduction.toFixed(2)).toBe('2000.00');
    expect(p.overtimeAmount.toFixed(2)).toBe('2884.62');
    expect(p.netPay.toFixed(2)).toBe('50884.62');
  });

  it('adds festival bonus when included', () => {
    const p = computePayslip({ ...base, includeFestivalBonus: true, taxEnabled: false, pfPercent: '0' });
    expect(p.festivalBonus.toFixed(2)).toBe('30000.00');
    expect(p.gross.toFixed(2)).toBe('80000.00');
  });

  it('pays daily-wage workers per day present', () => {
    const p = computePayslip({ ...base, employmentType: 'daily_wage', dailyWage: '800', presentDays: '22.5', overtimeHours: 4 });
    expect(p.basic.toFixed(2)).toBe('18000.00');
    expect(p.overtimeAmount.toFixed(2)).toBe('800.00');
    expect(p.tds.toFixed(2)).toBe('0.00');
    expect(p.netPay.toFixed(2)).toBe('18800.00');
  });
});

describe('RA bill', () => {
  const input = {
    lines: [
      { rate: '12000', previousQty: '10', currentQty: '15', quantity: '100' }, // 180,000
      { rate: '850.50', previousQty: '0', currentQty: '200', quantity: '1000' }, // 170,100
    ],
    retentionPercent: '10',
    vatPercent: '7.5',
    advanceRecoveryPercent: '10',
    advanceOutstanding: '1000000',
  };

  it('computes gross, retention, advance recovery, VAT and net', () => {
    const r = computeRaBill(input);
    expect(r.gross.toFixed(2)).toBe('350100.00');
    expect(r.retention.toFixed(2)).toBe('35010.00');
    expect(r.recovery.toFixed(2)).toBe('35010.00');
    expect(r.vat.toFixed(2)).toBe('26257.50');
    expect(r.net.toFixed(2)).toBe('306337.50');
  });

  it('caps advance recovery at the outstanding advance', () => {
    const r = computeRaBill({ ...input, advanceOutstanding: '5000' });
    expect(r.recovery.toFixed(2)).toBe('5000.00');
  });

  it('rejects cumulative quantity above BOQ', () => {
    expect(() => computeRaBill({ ...input, lines: [{ rate: '1', previousQty: '95', currentQty: '6', quantity: '100' }] })).toThrow(/exceeds BOQ/);
  });
});

describe('leave days', () => {
  it('skips Fridays and public holidays', () => {
    // 2026-09-21 (Mon) .. 2026-09-27 (Sun): Friday 25th excluded, 23rd is a holiday
    const days = countLeaveDays('2026-09-21', '2026-09-27', [5], new Set(['2026-09-23']));
    expect(days).toEqual(['2026-09-21', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-27']);
  });
});

describe('document lines', () => {
  it('computes amount and VAT per line', () => {
    const r = computeLines(
      [
        { description: 'Cement', quantity: '100', unitPrice: '520', vatCodeId: 'v15' },
        { description: 'Transport', quantity: '1', unitPrice: '3000', vatCodeId: null },
      ],
      new Map([['v15', '15']]),
    );
    expect(r.subtotal.toFixed(2)).toBe('55000.00');
    expect(r.vat.toFixed(2)).toBe('7800.00');
  });
});

describe('progress rollup', () => {
  it('weights leaf tasks only', () => {
    const p = rollupProgress([
      { id: 'root', parentId: null, progress: '0', weight: '1' },
      { id: 'a', parentId: 'root', progress: '100', weight: '3' },
      { id: 'b', parentId: 'root', progress: '0', weight: '1' },
    ]);
    expect(p).toBe(75);
  });
});
