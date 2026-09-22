import { normalizeLines } from './posting.service';
import { applyIssue, applyReceipt } from './stock.service';
import { D } from '../common/money';

describe('normalizeLines', () => {
  it('accepts a balanced entry and drops zero lines', () => {
    const out = normalizeLines([
      { account: 'ap', credit: '1150.00' },
      { account: 'inventory', debit: '1000' },
      { account: 'vat_input', debit: '150' },
      { account: 'tds_payable', debit: 0, credit: 0 },
    ]);
    expect(out).toHaveLength(3);
    expect(out.map((l) => l.debit.toFixed(2))).toEqual(['0.00', '1000.00', '150.00']);
  });

  it('flips negative amounts to the other side', () => {
    const out = normalizeLines([
      { account: 'a', debit: '-50' },
      { account: 'b', debit: '50' },
    ]);
    expect(out[0].credit.toFixed(2)).toBe('50.00');
    expect(out[0].debit.toFixed(2)).toBe('0.00');
  });

  it('nets a line that has both debit and credit', () => {
    const out = normalizeLines([
      { account: 'a', debit: '100', credit: '30' },
      { account: 'b', credit: '70' },
    ]);
    expect(out[0].debit.toFixed(2)).toBe('70.00');
  });

  it('rejects unbalanced entries', () => {
    expect(() => normalizeLines([{ account: 'a', debit: '100' }, { account: 'b', credit: '99.99' }])).toThrow(/not balanced/);
  });

  it('rejects entries with fewer than two non-zero lines', () => {
    expect(() => normalizeLines([{ account: 'a', debit: '0' }, { account: 'b', credit: '0' }])).toThrow(/two non-zero/);
  });

  it('is exact with decimal amounts that break floats', () => {
    expect(() =>
      normalizeLines([
        { account: 'a', debit: '0.1' },
        { account: 'b', debit: '0.2' },
        { account: 'c', credit: '0.3' },
      ]),
    ).not.toThrow();
  });
});

describe('weighted average stock', () => {
  const empty = { quantity: D(0), value: D(0) };

  it('averages cost across receipts', () => {
    const a = applyReceipt(empty, 100, 500); // 100 bags @ 500
    const b = applyReceipt({ quantity: a.quantity, value: a.value }, 50, 530); // 50 @ 530
    expect(b.quantity.toString()).toBe('150');
    expect(b.value.toFixed(2)).toBe('76500.00');
    expect(b.avgCost.toFixed(2)).toBe('510.00');
  });

  it('issues at average cost', () => {
    const r = applyIssue({ quantity: D(150), value: D(76500) }, 30);
    expect(r.movementValue.toFixed(2)).toBe('15300.00');
    expect(r.quantity.toString()).toBe('120');
    expect(r.value.toFixed(2)).toBe('61200.00');
  });

  it('issuing the full balance leaves no value residue', () => {
    const r = applyIssue({ quantity: D(3), value: D('100.00') }, 3);
    expect(r.movementValue.toFixed(2)).toBe('100.00');
    expect(r.value.toFixed(2)).toBe('0.00');
  });

  it('rejects negative stock', () => {
    expect(() => applyIssue({ quantity: D(5), value: D(50) }, 6)).toThrow(/Insufficient stock/);
  });
});
