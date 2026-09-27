import { computeEntitlement } from './investors.service';
import { computeQuotation } from './quotations.service';
import { candidateStatusFor, stageIndex } from './eb3.service';
import { D } from '../../common/money';

describe('computeEntitlement', () => {
  const base = { profitSharePercent: '25', sharesLoss: false, alreadyAllocated: D(0) };

  it('gives the agreed share of the profit', () => {
    const r = computeEntitlement({ ...base, projectProfit: D('1000000') });
    expect(r.entitlement.toFixed(2)).toBe('250000.00');
    expect(r.outstanding.toFixed(2)).toBe('250000.00');
  });

  it('nets off what has already been booked so allocations can repeat', () => {
    const r = computeEntitlement({ ...base, projectProfit: D('1000000'), alreadyAllocated: D('150000') });
    expect(r.entitlement.toFixed(2)).toBe('250000.00');
    expect(r.outstanding.toFixed(2)).toBe('100000.00');
  });

  it('claws back an over-allocation when the profit falls', () => {
    const r = computeEntitlement({ ...base, projectProfit: D('400000'), alreadyAllocated: D('150000') });
    expect(r.outstanding.toFixed(2)).toBe('-50000.00');
  });

  it('shields an investor who does not carry losses', () => {
    const r = computeEntitlement({ ...base, projectProfit: D('-800000') });
    expect(r.entitlement.toFixed(2)).toBe('0.00');
    expect(r.outstanding.toFixed(2)).toBe('0.00');
  });

  it('passes the loss on when the agreement says so', () => {
    const r = computeEntitlement({ ...base, sharesLoss: true, projectProfit: D('-800000') });
    expect(r.entitlement.toFixed(2)).toBe('-200000.00');
  });

  it('handles a fractional share percentage without float drift', () => {
    const r = computeEntitlement({ ...base, profitSharePercent: '12.5', projectProfit: D('333333.33') });
    expect(r.entitlement.toFixed(2)).toBe('41666.67');
  });
});

describe('computeQuotation', () => {
  const lines = [
    { quantity: '1', rate: '0', isSection: true },
    { quantity: '120.5', rate: '850.75', isSection: false },
    { quantity: '3', rate: '12000', isSection: false },
  ];

  it('prices lines, skips section headers and adds VAT on the net', () => {
    const c = computeQuotation(lines, '0', '15');
    // 120.5 * 850.75 = 102,515.375 -> 102,515.38 ; + 36,000
    expect(c.subtotal.toFixed(2)).toBe('138515.38');
    expect(c.vat.toFixed(2)).toBe('20777.31');
    expect(c.total.toFixed(2)).toBe('159292.69');
  });

  it('takes the discount before VAT', () => {
    const c = computeQuotation(lines, '8515.38', '15');
    expect(c.vat.toFixed(2)).toBe('19500.00');
    expect(c.total.toFixed(2)).toBe('149500.00');
  });

  it('rejects a discount bigger than the quotation', () => {
    expect(() => computeQuotation(lines, '200000', '15')).toThrow(/Discount is larger/);
  });

  it('gives section rows a zero amount', () => {
    const c = computeQuotation(lines, '0', '0');
    expect(c.amounts[0].toFixed(2)).toBe('0.00');
    expect(c.total.toFixed(2)).toBe('138515.38');
  });
});

describe('EB-3 stages', () => {
  it('orders the statutory stages', () => {
    expect(stageIndex('perm_filed')).toBeLessThan(stageIndex('i140_filed'));
    expect(stageIndex('i140_approved')).toBeLessThan(stageIndex('visa_approved'));
    expect(stageIndex('nonsense')).toBe(-1);
  });

  it(`moves the candidate own status only at the outcome stages`, () => {
    expect(candidateStatusFor('visa_approved')).toBe('visa_issued');
    expect(candidateStatusFor('departed')).toBe('departed');
    expect(candidateStatusFor('visa_denied')).toBe('rejected');
    expect(candidateStatusFor('perm_filed')).toBeNull();
  });
});
