import { D, Decimal, Num } from '../../common/money';

export interface TaxSlab {
  upTo: number | null;
  rate: number;
}

/** Progressive tax over cumulative slab ceilings. Pure. */
export function annualTax(taxable: Num, slabs: TaxSlab[], minimumTax: Num = 0): Decimal {
  let remaining = D(taxable);
  let floor = new Decimal(0);
  let tax = new Decimal(0);
  for (const s of slabs) {
    if (remaining.lte(0)) break;
    const width = s.upTo == null ? remaining : Decimal.min(remaining, D(s.upTo).minus(floor));
    tax = tax.plus(width.times(s.rate).dividedBy(100));
    remaining = remaining.minus(width);
    if (s.upTo != null) floor = D(s.upTo);
  }
  tax = tax.toDecimalPlaces(2);
  return tax.greaterThan(0) ? Decimal.max(tax, D(minimumTax)) : tax;
}

export interface PayslipInput {
  employmentType: string;
  dailyWage?: Num;
  basic: Num;
  houseRent: Num;
  medical: Num;
  conveyance: Num;
  otherAllowance: Num;
  pfPercent: Num;
  overtimeRatePerHour: Num;
  taxEnabled: boolean;
  workingDays: number;
  presentDays: Num; // present + late + 0.5 × half-day
  unpaidDays: Num; // absent + 0.5 × half-day + unpaid leave
  overtimeHours: Num;
  includeFestivalBonus: boolean;
  festivalBonusPercent: Num;
  slabs: TaxSlab[];
  exemptionCap: Num;
  minimumTax: Num;
}

/**
 * Bangladesh-style monthly payslip. Pure.
 * - Absence deduction: basic / 30 per unpaid day (Labour Act practice).
 * - Overtime: explicit hourly rate, else 2 × basic / 208.
 * - Festival bonus: % of basic.
 * - TDS: (annualized gross + 2 festival bonuses − min(1/3, cap) exemption) through slabs, ÷ 12.
 * - Daily-wage workers: wage × days present; OT at 2 × wage / 8; no PF / TDS.
 */
export function computePayslip(i: PayslipInput) {
  const zero = new Decimal(0);
  const r2 = (x: Decimal) => x.toDecimalPlaces(2);

  if (i.employmentType === 'daily_wage') {
    const wage = D(i.dailyWage);
    const earned = r2(wage.times(D(i.presentDays)));
    const otAmount = r2(wage.dividedBy(8).times(2).times(D(i.overtimeHours)));
    const gross = earned.plus(otAmount);
    return {
      basic: earned, houseRent: zero, medical: zero, conveyance: zero, otherAllowance: zero,
      overtimeAmount: otAmount, festivalBonus: zero, gross, absentDeduction: zero,
      pfEmployee: zero, pfEmployer: zero, tds: zero, netPay: gross,
    };
  }

  const basic = D(i.basic);
  const fixedGross = basic.plus(D(i.houseRent)).plus(D(i.medical)).plus(D(i.conveyance)).plus(D(i.otherAllowance));
  const absentDeduction = r2(basic.dividedBy(30).times(D(i.unpaidDays)));
  const otRate = D(i.overtimeRatePerHour).greaterThan(0) ? D(i.overtimeRatePerHour) : basic.times(2).dividedBy(208);
  const overtimeAmount = r2(otRate.times(D(i.overtimeHours)));
  const bonusOnce = r2(basic.times(D(i.festivalBonusPercent)).dividedBy(100));
  const festivalBonus = i.includeFestivalBonus ? bonusOnce : zero;
  const gross = fixedGross.plus(overtimeAmount).plus(festivalBonus);
  const pfEmployee = r2(basic.times(D(i.pfPercent)).dividedBy(100));

  let tds = zero;
  if (i.taxEnabled) {
    const annual = fixedGross.times(12).plus(bonusOnce.times(2));
    const exemption = Decimal.min(annual.dividedBy(3), D(i.exemptionCap));
    tds = r2(annualTax(annual.minus(exemption), i.slabs, i.minimumTax).dividedBy(12));
  }
  const netPay = gross.minus(absentDeduction).minus(pfEmployee).minus(tds);
  return {
    basic, houseRent: D(i.houseRent), medical: D(i.medical), conveyance: D(i.conveyance), otherAllowance: D(i.otherAllowance),
    overtimeAmount, festivalBonus, gross, absentDeduction, pfEmployee, pfEmployer: pfEmployee, tds, netPay,
  };
}
