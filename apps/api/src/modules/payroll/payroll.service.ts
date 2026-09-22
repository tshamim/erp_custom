import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { PayrollRunDto, SalaryStructureDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PostingService, PostLine } from '../../ledger/posting.service';
import { D, Decimal, m2, q4, sum } from '../../common/money';
import { computePayslip, TaxSlab } from './payroll.calc';
import { countLeaveDays } from '../hr/attendance-leave.service';

@Injectable()
export class PayrollService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
  ) {}

  structures() {
    return this.ctx.db
      .select({
        s: t.salaryStructures,
        code: t.employees.code,
        name: sql<string>`${t.employees.firstName} || coalesce(' ' || ${t.employees.lastName}, '')`,
      })
      .from(t.salaryStructures)
      .innerJoin(t.employees, eq(t.employees.id, t.salaryStructures.employeeId))
      .orderBy(asc(t.employees.code))
      .then((rows) => rows.map((r) => ({ ...r.s, code: r.code, name: r.name })));
  }

  async saveStructure(dto: SalaryStructureDto) {
    const gross = m2(sum([dto.basic, dto.houseRent, dto.medical, dto.conveyance, dto.otherAllowance]));
    const values = { ...dto, gross };
    const [row] = await this.ctx.db
      .insert(t.salaryStructures)
      .values(values)
      .onConflictDoUpdate({ target: t.salaryStructures.employeeId, set: values })
      .returning();
    await this.ctx.db.insert(t.employmentHistory).values({ employeeId: dto.employeeId, effectiveDate: dto.effectiveFrom, event: 'increment', grossSalary: gross, remarks: 'Salary structure updated' });
    await this.audit.log('update', 'salary_structure', row.id, null, values);
    return row;
  }

  private async settings(db: TenantDb) {
    const rows = await db.select().from(t.settings).where(sql`${t.settings.key} like 'payroll.%' or ${t.settings.key} = 'hr.weekend_days'`);
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
    return {
      slabs: (s['payroll.tax_slabs'] as TaxSlab[]) ?? [],
      exemptionCap: String(s['payroll.tax_exemption_cap'] ?? 450000),
      minimumTax: String(s['payroll.minimum_tax'] ?? 0),
      bonusPercent: String(s['payroll.festival_bonus_percent_of_basic'] ?? 100),
      workingDays: Number(s['payroll.working_days_per_month'] ?? 26),
      weekend: (s['hr.weekend_days'] as number[]) ?? [5],
    };
  }

  runs() {
    return this.ctx.db.select().from(t.payrollRuns).orderBy(desc(t.payrollRuns.month));
  }

  async getRun(id: string) {
    const db = this.ctx.db;
    const [run] = await db.select().from(t.payrollRuns).where(eq(t.payrollRuns.id, id));
    if (!run) throw new NotFoundException();
    const slips = await db
      .select({
        p: t.payslips,
        code: t.employees.code,
        name: sql<string>`${t.employees.firstName} || coalesce(' ' || ${t.employees.lastName}, '')`,
        designation: t.designations.name,
        projectName: t.projects.name,
        bankAccountNo: t.employees.bankAccountNo,
      })
      .from(t.payslips)
      .innerJoin(t.employees, eq(t.employees.id, t.payslips.employeeId))
      .leftJoin(t.designations, eq(t.designations.id, t.employees.designationId))
      .leftJoin(t.projects, eq(t.projects.id, t.payslips.projectId))
      .where(eq(t.payslips.runId, id))
      .orderBy(asc(t.employees.code));
    return { ...run, payslips: slips.map((s) => ({ ...s.p, code: s.code, name: s.name, designation: s.designation, projectName: s.projectName, bankAccountNo: s.bankAccountNo })) };
  }

  /** Creates (or regenerates, while draft) the run for a month from attendance + salary structures. */
  async generate(dto: PayrollRunDto) {
    const db = this.ctx.db;
    const cfg = await this.settings(db);
    const [y, m] = dto.month.split('-').map(Number);
    const periodStart = `${dto.month}-01`;
    const periodEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const workingDays = dto.workingDays ?? cfg.workingDays;

    const runId = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(t.payrollRuns).where(eq(t.payrollRuns.month, dto.month)).for('update');
      if (existing && existing.status !== 'draft') throw new BadRequestException(`Payroll for ${dto.month} is already finalized`);
      let id = existing?.id;
      if (id) {
        await tx.delete(t.payslips).where(eq(t.payslips.runId, id));
        await tx.update(t.payrollRuns).set({ workingDays, includeFestivalBonus: dto.includeFestivalBonus }).where(eq(t.payrollRuns.id, id));
      } else {
        const no = await this.numbering.next(tx, 'payroll', periodStart);
        const [r] = await tx
          .insert(t.payrollRuns)
          .values({ no, month: dto.month, periodStart, periodEnd, workingDays, includeFestivalBonus: dto.includeFestivalBonus })
          .returning({ id: t.payrollRuns.id });
        id = r.id;
      }

      const emps = await tx
        .select({ e: t.employees, s: t.salaryStructures })
        .from(t.employees)
        .leftJoin(t.salaryStructures, eq(t.salaryStructures.employeeId, t.employees.id))
        .where(and(eq(t.employees.status, 'active'), lte(t.employees.joiningDate, periodEnd)));
      const eligible = emps.filter((r) => r.s || (r.e.employmentType === 'daily_wage' && r.e.dailyWage));
      if (!eligible.length) throw new BadRequestException('No active employees with a salary structure or daily wage');
      const ids = eligible.map((r) => r.e.id);

      const att = await tx
        .select({
          employeeId: t.attendance.employeeId,
          records: sql<number>`count(*)::int`,
          present: sql<number>`count(*) filter (where ${t.attendance.status} in ('present','late'))::int`,
          half: sql<number>`count(*) filter (where ${t.attendance.status} = 'half_day')::int`,
          absent: sql<number>`count(*) filter (where ${t.attendance.status} = 'absent')::int`,
          ot: sql<string>`coalesce(sum(${t.attendance.overtimeHours}), 0)`,
        })
        .from(t.attendance)
        .where(and(inArray(t.attendance.employeeId, ids), gte(t.attendance.date, periodStart), lte(t.attendance.date, periodEnd)))
        .groupBy(t.attendance.employeeId);

      const unpaid = await tx
        .select({ employeeId: t.leaveRequests.employeeId, fromDate: t.leaveRequests.fromDate, toDate: t.leaveRequests.toDate })
        .from(t.leaveRequests)
        .innerJoin(t.leaveTypes, eq(t.leaveTypes.id, t.leaveRequests.leaveTypeId))
        .where(and(eq(t.leaveRequests.status, 'approved'), eq(t.leaveTypes.isPaid, false), lte(t.leaveRequests.fromDate, periodEnd), gte(t.leaveRequests.toDate, periodStart)));
      const hol = await tx.select({ date: t.holidays.date }).from(t.holidays).where(and(gte(t.holidays.date, periodStart), lte(t.holidays.date, periodEnd)));
      const holidays = new Set(hol.map((h) => h.date));

      const slips = eligible.map(({ e, s }) => {
        const a = att.find((x) => x.employeeId === e.id);
        const lwp = unpaid
          .filter((u) => u.employeeId === e.id)
          .reduce((acc, u) => acc + countLeaveDays(u.fromDate > periodStart ? u.fromDate : periodStart, u.toDate < periodEnd ? u.toDate : periodEnd, cfg.weekend, holidays).length, 0);
        // No attendance captured → treat as full month (monthly staff) / zero days (daily wage).
        const hasAtt = !!a && a.records > 0;
        const present = hasAtt ? D(a!.present).plus(D(a!.half).times(0.5)) : e.employmentType === 'daily_wage' ? new Decimal(0) : D(workingDays);
        const unpaidDays = hasAtt ? D(a!.absent).plus(D(a!.half).times(0.5)).plus(lwp) : D(lwp);
        const c = computePayslip({
          employmentType: e.employmentType,
          dailyWage: e.dailyWage,
          basic: s?.basic ?? 0,
          houseRent: s?.houseRent ?? 0,
          medical: s?.medical ?? 0,
          conveyance: s?.conveyance ?? 0,
          otherAllowance: s?.otherAllowance ?? 0,
          pfPercent: s?.pfPercent ?? 0,
          overtimeRatePerHour: s?.overtimeRatePerHour ?? 0,
          taxEnabled: s?.taxEnabled ?? false,
          workingDays,
          presentDays: present,
          unpaidDays,
          overtimeHours: a?.ot ?? 0,
          includeFestivalBonus: dto.includeFestivalBonus,
          festivalBonusPercent: cfg.bonusPercent,
          slabs: cfg.slabs,
          exemptionCap: cfg.exemptionCap,
          minimumTax: cfg.minimumTax,
        });
        return {
          runId: id!,
          employeeId: e.id,
          projectId: e.currentProjectId,
          presentDays: q4(present),
          absentDays: q4(unpaidDays),
          leaveDays: q4(0),
          basic: m2(c.basic),
          houseRent: m2(c.houseRent),
          medical: m2(c.medical),
          conveyance: m2(c.conveyance),
          otherAllowance: m2(c.otherAllowance),
          overtimeHours: q4(a?.ot ?? 0),
          overtimeAmount: m2(c.overtimeAmount),
          festivalBonus: m2(c.festivalBonus),
          gross: m2(c.gross),
          absentDeduction: m2(c.absentDeduction),
          pfEmployee: m2(c.pfEmployee),
          pfEmployer: m2(c.pfEmployer),
          tds: m2(c.tds),
          otherDeduction: m2(0),
          netPay: m2(c.netPay),
        };
      });
      await tx.insert(t.payslips).values(slips);
      const totalGross = sum(slips.map((s) => s.gross));
      const totalNet = sum(slips.map((s) => s.netPay));
      await tx
        .update(t.payrollRuns)
        .set({ totalGross: m2(totalGross), totalNet: m2(totalNet), totalDeductions: m2(totalGross.minus(totalNet)) })
        .where(eq(t.payrollRuns.id, id!));
      return id!;
    });
    await this.audit.log('create', 'payroll_run', runId, null, dto);
    return this.getRun(runId);
  }

  /**
   * Finalize: Dr Labor cost (site staff, by project) / Salary expense (office) for earned pay,
   * Dr Festival bonus, Dr Employer PF  —  Cr Salary payable (net), Cr TDS payable, Cr PF payable (both shares).
   */
  async finalize(id: string) {
    await this.ctx.db.transaction(async (tx) => {
      const [run] = await tx.select().from(t.payrollRuns).where(eq(t.payrollRuns.id, id)).for('update');
      if (!run) throw new NotFoundException();
      if (run.status !== 'draft') throw new BadRequestException('Already finalized');
      const slips = await tx.select().from(t.payslips).where(eq(t.payslips.runId, id));
      const byProject = new Map<string, Decimal>();
      for (const s of slips) {
        const earned = D(s.gross).minus(s.festivalBonus).minus(s.absentDeduction);
        const k = s.projectId ?? '';
        byProject.set(k, (byProject.get(k) ?? new Decimal(0)).plus(earned));
      }
      const lines: PostLine[] = [
        ...[...byProject.entries()].map(([projectId, amt]) => ({
          account: projectId ? 'labor_cost' : 'salary_expense',
          debit: amt,
          projectId: projectId || null,
          description: `Salaries ${run.month}`,
        })),
        { account: 'bonus_expense', debit: sum(slips.map((s) => s.festivalBonus)), description: 'Festival bonus' },
        { account: 'pf_expense', debit: sum(slips.map((s) => s.pfEmployer)), description: 'Employer PF contribution' },
        { account: 'salary_payable', credit: sum(slips.map((s) => s.netPay)), description: `Net pay ${run.month}` },
        { account: 'tds_payable', credit: sum(slips.map((s) => s.tds)), description: 'TDS on salary' },
        { account: 'pf_payable', credit: sum(slips.map((s) => D(s.pfEmployee).plus(s.pfEmployer))), description: 'Provident fund' },
      ];
      const entryId = await this.posting.post(tx, { date: run.periodEnd, sourceType: 'payroll', sourceId: run.id, reference: run.no, narration: `Payroll ${run.month}`, lines });
      await tx.update(t.payrollRuns).set({ status: 'finalized', journalEntryId: entryId }).where(eq(t.payrollRuns.id, id));
    });
    await this.audit.log('post', 'payroll_run', id);
    return this.getRun(id);
  }

  /** Disburses net salaries from a bank/cash account: Dr Salary payable / Cr Bank. */
  async pay(id: string, cashAccountId: string, date: string) {
    const run = await this.getRun(id);
    if (run.status !== 'finalized') throw new BadRequestException('Finalize the payroll first');
    const [already] = await this.ctx.db
      .select({ id: t.journalEntries.id })
      .from(t.journalEntries)
      .where(and(eq(t.journalEntries.sourceType, 'payroll_payment'), eq(t.journalEntries.sourceId, id), eq(t.journalEntries.status, 'posted')));
    if (already) throw new BadRequestException('Salaries for this run are already paid');
    const entryId = await this.ctx.db.transaction((tx) =>
      this.posting.post(tx, {
        date,
        sourceType: 'payroll_payment',
        sourceId: id,
        reference: run.no,
        narration: `Salary disbursement ${run.month}`,
        lines: [
          { account: 'salary_payable', debit: run.totalNet },
          { account: { id: cashAccountId }, credit: run.totalNet },
        ],
      }),
    );
    await this.audit.log('post', 'payroll_payment', id, null, { entryId });
    return { entryId };
  }
}
