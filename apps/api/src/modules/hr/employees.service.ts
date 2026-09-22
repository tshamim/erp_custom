import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { tenantSchema as t } from '@erp/db';
import type { EmployeeDto, ListQuery } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { searchClause } from '../../common/pagination';

export interface EmployeeListQuery extends ListQuery {
  departmentId?: string;
  employmentType?: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  async list(q: EmployeeListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.employees.code, t.employees.firstName, t.employees.lastName, t.employees.phone, t.employees.nid]),
      q.status ? eq(t.employees.status, q.status) : undefined,
      q.departmentId ? eq(t.employees.departmentId, q.departmentId) : undefined,
      q.employmentType ? eq(t.employees.employmentType, q.employmentType) : undefined,
      q.projectId ? eq(t.employees.currentProjectId, q.projectId) : undefined,
    );
    const data = await db
      .select({
        id: t.employees.id,
        code: t.employees.code,
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
        phone: t.employees.phone,
        email: t.employees.email,
        employmentType: t.employees.employmentType,
        status: t.employees.status,
        joiningDate: t.employees.joiningDate,
        dailyWage: t.employees.dailyWage,
        departmentName: t.departments.name,
        designationName: t.designations.name,
        projectName: t.projects.name,
      })
      .from(t.employees)
      .leftJoin(t.departments, eq(t.departments.id, t.employees.departmentId))
      .leftJoin(t.designations, eq(t.designations.id, t.employees.designationId))
      .leftJoin(t.projects, eq(t.projects.id, t.employees.currentProjectId))
      .where(where)
      .orderBy(asc(t.employees.code))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.employees).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const manager = alias(t.employees, 'manager');
    const [row] = await db
      .select({
        employee: t.employees,
        departmentName: t.departments.name,
        designationName: t.designations.name,
        managerName: sql<string | null>`${manager.firstName} || coalesce(' ' || ${manager.lastName}, '')`,
      })
      .from(t.employees)
      .leftJoin(t.departments, eq(t.departments.id, t.employees.departmentId))
      .leftJoin(t.designations, eq(t.designations.id, t.employees.designationId))
      .leftJoin(manager, eq(manager.id, t.employees.managerId))
      .where(eq(t.employees.id, id));
    if (!row) throw new NotFoundException();
    const history = await db
      .select()
      .from(t.employmentHistory)
      .where(eq(t.employmentHistory.employeeId, id))
      .orderBy(asc(t.employmentHistory.effectiveDate));
    const [salary] = await db.select().from(t.salaryStructures).where(eq(t.salaryStructures.employeeId, id));
    return { ...row.employee, departmentName: row.departmentName, designationName: row.designationName, managerName: row.managerName, history, salary: salary ?? null };
  }

  private clean(dto: Partial<EmployeeDto>) {
    const v = { ...dto } as Record<string, unknown>;
    if (v.email === '') v.email = null;
    if (v.employmentType && v.employmentType !== 'daily_wage') v.dailyWage = v.dailyWage ?? null;
    return v as Partial<typeof t.employees.$inferInsert>;
  }

  async create(dto: EmployeeDto) {
    if (dto.employmentType === 'daily_wage' && !dto.dailyWage) {
      throw new BadRequestException('Daily wage is required for daily-wage workers');
    }
    const id = await this.ctx.db.transaction(async (tx) => {
      const code = dto.code || (await this.numbering.next(tx, 'employee', dto.joiningDate));
      const [e] = await tx
        .insert(t.employees)
        .values({ ...(this.clean(dto) as typeof t.employees.$inferInsert), code })
        .returning({ id: t.employees.id });
      await tx.insert(t.employmentHistory).values({
        employeeId: e.id,
        effectiveDate: dto.joiningDate,
        event: 'joined',
        departmentId: dto.departmentId,
        designationId: dto.designationId,
      });
      return e.id;
    });
    await this.audit.log('create', 'employee', id, null, dto);
    return this.get(id);
  }

  async update(id: string, dto: Partial<EmployeeDto>) {
    const before = await this.get(id);
    await this.ctx.db.transaction(async (tx) => {
      await tx.update(t.employees).set(this.clean(dto)).where(eq(t.employees.id, id));
      const events: [string, boolean][] = [
        ['transferred', dto.departmentId !== undefined && dto.departmentId !== before.departmentId],
        ['promoted', dto.designationId !== undefined && dto.designationId !== before.designationId],
        ['exited', !!dto.status && dto.status !== 'active' && before.status === 'active'],
      ];
      for (const [event, happened] of events) {
        if (!happened) continue;
        await tx.insert(t.employmentHistory).values({
          employeeId: id,
          effectiveDate: (event === 'exited' && dto.exitDate) || new Date().toISOString().slice(0, 10),
          event,
          departmentId: dto.departmentId ?? before.departmentId,
          designationId: dto.designationId ?? before.designationId,
        });
      }
    });
    const after = await this.get(id);
    await this.audit.log('update', 'employee', id, before, after);
    return after;
  }

  /** Active employee picker, optionally filtered. */
  pick(filters: SQL[] = []) {
    return this.ctx.db
      .select({
        id: t.employees.id,
        code: t.employees.code,
        name: sql<string>`${t.employees.firstName} || coalesce(' ' || ${t.employees.lastName}, '')`,
        employmentType: t.employees.employmentType,
        currentProjectId: t.employees.currentProjectId,
      })
      .from(t.employees)
      .where(and(eq(t.employees.status, 'active'), ...filters))
      .orderBy(asc(t.employees.code));
  }
}
