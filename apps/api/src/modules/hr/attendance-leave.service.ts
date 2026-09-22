import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { AttendanceBulkDto, LeaveRequestDto, ListQuery } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { D, q4 } from '../../common/money';

/** Friday is the weekly holiday in Bangladesh (0 = Sunday … 6 = Saturday). */
const DEFAULT_WEEKEND = [5];

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Working days in [from, to] excluding weekend days and public holidays. Pure. */
export function countLeaveDays(from: string, to: string, weekend: number[], holidays: Set<string>): string[] {
  return eachDate(from, to).filter((d) => !weekend.includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !holidays.has(d));
}

@Injectable()
export class AttendanceLeaveService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private async weekend(db: TenantDb): Promise<number[]> {
    const [row] = await db.select().from(t.settings).where(eq(t.settings.key, 'hr.weekend_days'));
    return Array.isArray(row?.value) ? (row!.value as number[]) : DEFAULT_WEEKEND;
  }

  // ---------------- attendance ----------------

  /** Sheet for a date: every active employee (optionally at one project) with their record if any. */
  async sheet(date: string, projectId?: string) {
    const db = this.ctx.db;
    return db
      .select({
        employeeId: t.employees.id,
        code: t.employees.code,
        name: sql<string>`${t.employees.firstName} || coalesce(' ' || ${t.employees.lastName}, '')`,
        employmentType: t.employees.employmentType,
        attendanceId: t.attendance.id,
        status: t.attendance.status,
        checkIn: t.attendance.checkIn,
        checkOut: t.attendance.checkOut,
        overtimeHours: t.attendance.overtimeHours,
        remarks: t.attendance.remarks,
      })
      .from(t.employees)
      .leftJoin(t.attendance, and(eq(t.attendance.employeeId, t.employees.id), eq(t.attendance.date, date)))
      .where(and(eq(t.employees.status, 'active'), projectId ? eq(t.employees.currentProjectId, projectId) : undefined))
      .orderBy(asc(t.employees.code));
  }

  async saveBulk(dto: AttendanceBulkDto) {
    await this.ctx.db.transaction(async (tx) => {
      for (const r of dto.records) {
        const values = {
          employeeId: r.employeeId,
          date: dto.date,
          status: r.status,
          checkIn: r.checkIn ?? null,
          checkOut: r.checkOut ?? null,
          overtimeHours: r.overtimeHours,
          projectId: dto.projectId ?? null,
          remarks: r.remarks ?? null,
        };
        await tx
          .insert(t.attendance)
          .values(values)
          .onConflictDoUpdate({ target: [t.attendance.employeeId, t.attendance.date], set: values });
      }
    });
    await this.audit.log('update', 'attendance', null, null, { date: dto.date, count: dto.records.length });
    return { saved: dto.records.length };
  }

  /** Per-employee counts for a month (YYYY-MM). */
  async monthlySummary(month: string, projectId?: string) {
    const from = `${month}-01`;
    const to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return this.ctx.db
      .select({
        employeeId: t.employees.id,
        code: t.employees.code,
        name: sql<string>`${t.employees.firstName} || coalesce(' ' || ${t.employees.lastName}, '')`,
        present: sql<number>`count(*) filter (where ${t.attendance.status} in ('present','late'))::int`,
        halfDay: sql<number>`count(*) filter (where ${t.attendance.status} = 'half_day')::int`,
        absent: sql<number>`count(*) filter (where ${t.attendance.status} = 'absent')::int`,
        leave: sql<number>`count(*) filter (where ${t.attendance.status} = 'leave')::int`,
        late: sql<number>`count(*) filter (where ${t.attendance.status} = 'late')::int`,
        overtimeHours: sql<string>`coalesce(sum(${t.attendance.overtimeHours}), 0)`,
      })
      .from(t.employees)
      .leftJoin(
        t.attendance,
        and(eq(t.attendance.employeeId, t.employees.id), gte(t.attendance.date, from), lte(t.attendance.date, to)),
      )
      .where(and(eq(t.employees.status, 'active'), projectId ? eq(t.employees.currentProjectId, projectId) : undefined))
      .groupBy(t.employees.id, t.employees.code, t.employees.firstName, t.employees.lastName)
      .orderBy(asc(t.employees.code));
  }

  // ---------------- leave ----------------

  /** Ensures balance rows exist for the employee & year (entitlement from leave type). */
  private async ensureBalances(db: TenantDb, employeeId: string, year: number) {
    const types = await db.select().from(t.leaveTypes);
    if (!types.length) return;
    await db
      .insert(t.leaveBalances)
      .values(types.map((lt) => ({ employeeId, leaveTypeId: lt.id, year, entitled: q4(lt.daysPerYear) })))
      .onConflictDoNothing();
  }

  async balances(employeeId: string, year = new Date().getFullYear()) {
    const db = this.ctx.db;
    await this.ensureBalances(db, employeeId, year);
    return db
      .select({
        leaveTypeId: t.leaveTypes.id,
        code: t.leaveTypes.code,
        name: t.leaveTypes.name,
        entitled: t.leaveBalances.entitled,
        used: t.leaveBalances.used,
        remaining: sql<string>`${t.leaveBalances.entitled} - ${t.leaveBalances.used}`,
      })
      .from(t.leaveBalances)
      .innerJoin(t.leaveTypes, eq(t.leaveTypes.id, t.leaveBalances.leaveTypeId))
      .where(and(eq(t.leaveBalances.employeeId, employeeId), eq(t.leaveBalances.year, year)))
      .orderBy(asc(t.leaveTypes.code));
  }

  async listRequests(q: ListQuery & { employeeId?: string }) {
    const db = this.ctx.db;
    const where = and(
      q.status ? eq(t.leaveRequests.status, q.status) : undefined,
      q.employeeId ? eq(t.leaveRequests.employeeId, q.employeeId) : undefined,
    );
    const data = await db
      .select({
        id: t.leaveRequests.id,
        employeeId: t.leaveRequests.employeeId,
        employeeName: sql<string>`${t.employees.firstName} || coalesce(' ' || ${t.employees.lastName}, '')`,
        employeeCode: t.employees.code,
        leaveType: t.leaveTypes.name,
        fromDate: t.leaveRequests.fromDate,
        toDate: t.leaveRequests.toDate,
        days: t.leaveRequests.days,
        reason: t.leaveRequests.reason,
        status: t.leaveRequests.status,
        createdAt: t.leaveRequests.createdAt,
      })
      .from(t.leaveRequests)
      .innerJoin(t.employees, eq(t.employees.id, t.leaveRequests.employeeId))
      .innerJoin(t.leaveTypes, eq(t.leaveTypes.id, t.leaveRequests.leaveTypeId))
      .where(where)
      .orderBy(desc(t.leaveRequests.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.leaveRequests).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  private async workingDates(db: TenantDb, from: string, to: string) {
    const hol = await db.select({ date: t.holidays.date }).from(t.holidays).where(and(gte(t.holidays.date, from), lte(t.holidays.date, to)));
    return countLeaveDays(from, to, await this.weekend(db), new Set(hol.map((h) => h.date)));
  }

  async requestLeave(dto: LeaveRequestDto) {
    const db = this.ctx.db;
    if (dto.fromDate.slice(0, 4) !== dto.toDate.slice(0, 4)) throw new BadRequestException('Leave cannot span two calendar years');
    const dates = await this.workingDates(db, dto.fromDate, dto.toDate);
    if (!dates.length) throw new BadRequestException('Selected range has no working days');
    const overlap = await db
      .select({ id: t.leaveRequests.id })
      .from(t.leaveRequests)
      .where(
        and(
          eq(t.leaveRequests.employeeId, dto.employeeId),
          inArray(t.leaveRequests.status, ['pending', 'approved']),
          lte(t.leaveRequests.fromDate, dto.toDate),
          gte(t.leaveRequests.toDate, dto.fromDate),
        ),
      );
    if (overlap.length) throw new BadRequestException('Overlaps an existing leave request');
    const bal = (await this.balances(dto.employeeId, Number(dto.fromDate.slice(0, 4)))).find((b) => b.leaveTypeId === dto.leaveTypeId);
    if (!bal) throw new BadRequestException('Unknown leave type');
    if (D(bal.remaining).lessThan(dates.length)) {
      throw new BadRequestException(`Insufficient ${bal.name} balance: ${D(bal.remaining).toFixed(1)} left, ${dates.length} requested`);
    }
    const [row] = await db
      .insert(t.leaveRequests)
      .values({ ...dto, days: q4(dates.length) })
      .returning();
    await this.audit.log('create', 'leave_request', row.id, null, row);
    return row;
  }

  async decide(id: string, status: 'approved' | 'rejected') {
    const result = await this.ctx.db.transaction(async (tx) => {
      const [req] = await tx.select().from(t.leaveRequests).where(eq(t.leaveRequests.id, id)).for('update');
      if (!req) throw new NotFoundException();
      if (req.status !== 'pending') throw new BadRequestException(`Request already ${req.status}`);
      await tx.update(t.leaveRequests).set({ status, decidedBy: this.ctx.userId }).where(eq(t.leaveRequests.id, id));
      if (status === 'approved') {
        const year = Number(req.fromDate.slice(0, 4));
        await this.ensureBalances(tx, req.employeeId, year);
        await tx
          .update(t.leaveBalances)
          .set({ used: sql`${t.leaveBalances.used} + ${req.days}` })
          .where(
            and(
              eq(t.leaveBalances.employeeId, req.employeeId),
              eq(t.leaveBalances.leaveTypeId, req.leaveTypeId),
              eq(t.leaveBalances.year, year),
            ),
          );
        for (const date of await this.workingDates(tx, req.fromDate, req.toDate)) {
          const values = { employeeId: req.employeeId, date, status: 'leave', remarks: 'Approved leave' };
          await tx
            .insert(t.attendance)
            .values(values)
            .onConflictDoUpdate({ target: [t.attendance.employeeId, t.attendance.date], set: values });
        }
      }
      return { ...req, status };
    });
    await this.audit.log(status === 'approved' ? 'approve' : 'reject', 'leave_request', id, null, result);
    return result;
  }
}
