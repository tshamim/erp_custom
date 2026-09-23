import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { tenantSchema as t } from '@erp/db';
import { listQuerySchema, ListQuery, userSchema, UserDto, roleSchema, RoleDto } from '@erp/shared';
import { UsersService, RolesService } from './users.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Perm('core.user.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.users.list(q);
  }

  @Get(':id')
  @Perm('core.user.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  @Perm('core.user.create')
  create(@ZBody(userSchema) dto: UserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Perm('core.user.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(userSchema.partial())) dto: Partial<UserDto>) {
    return this.users.update(id, dto);
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Perm('core.role.read')
  list() {
    return this.roles.list();
  }

  @Get('permissions')
  @Perm('core.role.read')
  permissions() {
    return this.roles.permissions();
  }

  @Post()
  @Perm('core.role.create')
  create(@ZBody(roleSchema) dto: RoleDto) {
    return this.roles.save(null, dto);
  }

  @Put(':id')
  @Perm('core.role.update')
  update(@Param('id', ParseUUIDPipe) id: string, @ZBody(roleSchema) dto: RoleDto) {
    return this.roles.save(id, dto);
  }

  @Delete(':id')
  @Perm('core.role.delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(id);
  }
}

const auditQuery = listQuerySchema.extend({ entity: z.string().optional(), entityId: z.string().optional() });

@Controller()
export class SystemController {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  @Get('audit-logs')
  @Perm('core.audit.read')
  async auditLogs(@ZQuery(auditQuery) q: z.infer<typeof auditQuery>) {
    const where = and(
      q.entity ? eq(t.auditLogs.entity, q.entity) : undefined,
      q.entityId ? eq(t.auditLogs.entityId, q.entityId) : undefined,
      q.from ? gte(t.auditLogs.at, new Date(q.from)) : undefined,
      q.to ? lte(t.auditLogs.at, new Date(`${q.to}T23:59:59Z`)) : undefined,
    );
    const data = await this.ctx.db
      .select({
        id: t.auditLogs.id,
        action: t.auditLogs.action,
        entity: t.auditLogs.entity,
        entityId: t.auditLogs.entityId,
        before: t.auditLogs.before,
        after: t.auditLogs.after,
        at: t.auditLogs.at,
        ip: t.auditLogs.ip,
        impersonatedBy: t.auditLogs.impersonatedBy,
        userName: t.users.name,
      })
      .from(t.auditLogs)
      .leftJoin(t.users, eq(t.users.id, t.auditLogs.userId))
      .where(where)
      .orderBy(desc(t.auditLogs.at))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return { data, page: q.page, pageSize: q.pageSize };
  }

  /** Settings are readable by any signed-in user (company name, currency, etc.). */
  @Get('settings')
  async settings() {
    const rows = await this.ctx.db.select().from(t.settings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  @Put('settings')
  @Perm('core.settings.update')
  async saveSettings(@Body(new ZodPipe(z.record(z.unknown()))) body: Record<string, unknown>) {
    for (const [key, value] of Object.entries(body)) {
      await this.ctx.db
        .insert(t.settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: t.settings.key, set: { value } });
    }
    await this.audit.log('update', 'settings', null, null, body);
    return this.settings();
  }

  @Get('lookups')
  async lookups(@Query('kinds') kinds = '') {
    const db = this.ctx.db;
    const want = new Set(kinds.split(',').filter(Boolean));
    const out: Record<string, unknown> = {};
    const add = async (k: string, fn: () => Promise<unknown>) => {
      if (!want.size || want.has(k)) out[k] = await fn();
    };
    await add('branches', () => db.select({ id: t.branches.id, code: t.branches.code, name: t.branches.name }).from(t.branches));
    await add('departments', () => db.select({ id: t.departments.id, code: t.departments.code, name: t.departments.name }).from(t.departments));
    await add('designations', () => db.select({ id: t.designations.id, name: t.designations.name }).from(t.designations));
    await add('uoms', () => db.select({ id: t.uoms.id, code: t.uoms.code, name: t.uoms.name }).from(t.uoms));
    await add('itemCategories', () => db.select({ id: t.itemCategories.id, code: t.itemCategories.code, name: t.itemCategories.name }).from(t.itemCategories));
    await add('warehouses', () =>
      db.select({ id: t.warehouses.id, code: t.warehouses.code, name: t.warehouses.name, projectId: t.warehouses.projectId }).from(t.warehouses),
    );
    await add('taxCodes', () =>
      db.select({ id: t.taxCodes.id, code: t.taxCodes.code, name: t.taxCodes.name, kind: t.taxCodes.kind, rate: t.taxCodes.rate }).from(t.taxCodes),
    );
    await add('leaveTypes', () => db.select().from(t.leaveTypes));
    await add('roles', () => db.select({ id: t.roles.id, name: t.roles.name }).from(t.roles));
    await add('projects', () => db.select({ id: t.projects.id, code: t.projects.code, name: t.projects.name, status: t.projects.status }).from(t.projects));
    await add('accounts', () =>
      db
        .select({ id: t.accounts.id, code: t.accounts.code, name: t.accounts.name, type: t.accounts.type, subtype: t.accounts.subtype, isGroup: t.accounts.isGroup })
        .from(t.accounts)
        .orderBy(t.accounts.code),
    );
    return out;
  }
}
