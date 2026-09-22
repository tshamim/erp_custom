import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { tenantSchema as t } from '@erp/db';
import type { ListQuery, UserDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { PermissionCache } from '../../auth/permission-cache.service';
import { searchClause } from '../../common/pagination';

const publicCols = {
  id: t.users.id,
  email: t.users.email,
  name: t.users.name,
  phone: t.users.phone,
  isActive: t.users.isActive,
  branchId: t.users.branchId,
  employeeId: t.users.employeeId,
  lastLoginAt: t.users.lastLoginAt,
  createdAt: t.users.createdAt,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly perms: PermissionCache,
  ) {}

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = searchClause(q, [t.users.name, t.users.email]);
    const rows = await db
      .select(publicCols)
      .from(t.users)
      .where(where)
      .orderBy(asc(t.users.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const roleRows = rows.length
      ? await db
          .select({ userId: t.userRoles.userId, id: t.roles.id, name: t.roles.name })
          .from(t.userRoles)
          .innerJoin(t.roles, eq(t.roles.id, t.userRoles.roleId))
          .where(inArray(t.userRoles.userId, rows.map((r) => r.id)))
      : [];
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.users).where(where);
    return {
      data: rows.map((r) => ({ ...r, roles: roleRows.filter((x) => x.userId === r.id).map(({ id, name }) => ({ id, name })) })),
      total: count,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async get(id: string) {
    const [user] = await this.ctx.db.select(publicCols).from(t.users).where(eq(t.users.id, id));
    if (!user) throw new NotFoundException();
    const roles = await this.ctx.db.select({ roleId: t.userRoles.roleId }).from(t.userRoles).where(eq(t.userRoles.userId, id));
    return { ...user, roleIds: roles.map((r) => r.roleId) };
  }

  async create(dto: UserDto) {
    if (!dto.password) throw new BadRequestException('Password is required');
    const id = await this.ctx.db.transaction(async (tx) => {
      const [u] = await tx
        .insert(t.users)
        .values({
          email: dto.email.toLowerCase(),
          name: dto.name,
          phone: dto.phone,
          isActive: dto.isActive,
          branchId: dto.branchId,
          employeeId: dto.employeeId,
          passwordHash: await hash(dto.password!),
        })
        .returning({ id: t.users.id });
      if (dto.roleIds.length) await tx.insert(t.userRoles).values(dto.roleIds.map((roleId) => ({ userId: u.id, roleId })));
      return u.id;
    });
    await this.audit.log('create', 'user', id, null, { ...dto, password: undefined });
    return this.get(id);
  }

  async update(id: string, dto: Partial<UserDto>) {
    const before = await this.get(id);
    if (id === this.ctx.userId && dto.isActive === false) throw new BadRequestException('You cannot deactivate yourself');
    await this.ctx.db.transaction(async (tx) => {
      const set: Partial<typeof t.users.$inferInsert> = {};
      if (dto.email) set.email = dto.email.toLowerCase();
      if (dto.name) set.name = dto.name;
      if (dto.phone !== undefined) set.phone = dto.phone;
      if (dto.isActive !== undefined) set.isActive = dto.isActive;
      if (dto.branchId !== undefined) set.branchId = dto.branchId;
      if (dto.employeeId !== undefined) set.employeeId = dto.employeeId;
      if (dto.password) {
        set.passwordHash = await hash(dto.password);
        set.tokenVersion = sql`${t.users.tokenVersion} + 1` as unknown as number;
      }
      if (Object.keys(set).length) await tx.update(t.users).set(set).where(eq(t.users.id, id));
      if (dto.roleIds) {
        await tx.delete(t.userRoles).where(eq(t.userRoles.userId, id));
        if (dto.roleIds.length) await tx.insert(t.userRoles).values(dto.roleIds.map((roleId) => ({ userId: id, roleId })));
      }
    });
    this.perms.invalidate(this.ctx.tenant.id, id);
    const after = await this.get(id);
    await this.audit.log('update', 'user', id, before, after);
    return after;
  }
}

@Injectable()
export class RolesService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly perms: PermissionCache,
  ) {}

  async list() {
    const db = this.ctx.db;
    const roles = await db.select().from(t.roles).orderBy(asc(t.roles.name));
    const rp = await db.select().from(t.rolePermissions);
    const counts = await db
      .select({ roleId: t.userRoles.roleId, count: sql<number>`count(*)::int` })
      .from(t.userRoles)
      .groupBy(t.userRoles.roleId);
    return roles.map((r) => ({
      ...r,
      permissions: rp.filter((x) => x.roleId === r.id).map((x) => x.permissionKey),
      userCount: counts.find((c) => c.roleId === r.id)?.count ?? 0,
    }));
  }

  permissions() {
    return this.ctx.db.select().from(t.permissions).orderBy(asc(t.permissions.key));
  }

  async save(id: string | null, dto: { name: string; description?: string | null; permissions: string[] }) {
    const db = this.ctx.db;
    if (id) {
      const [role] = await db.select().from(t.roles).where(eq(t.roles.id, id));
      if (!role) throw new NotFoundException();
      if (role.name === 'Admin') throw new BadRequestException('The Admin role cannot be modified');
    }
    const roleId = await db.transaction(async (tx) => {
      let rid = id;
      if (rid) {
        await tx.update(t.roles).set({ name: dto.name, description: dto.description }).where(eq(t.roles.id, rid));
        await tx.delete(t.rolePermissions).where(eq(t.rolePermissions.roleId, rid));
      } else {
        const [r] = await tx.insert(t.roles).values({ name: dto.name, description: dto.description }).returning({ id: t.roles.id });
        rid = r.id;
      }
      if (dto.permissions.length) {
        await tx.insert(t.rolePermissions).values(dto.permissions.map((permissionKey) => ({ roleId: rid!, permissionKey })));
      }
      return rid!;
    });
    this.perms.invalidate(this.ctx.tenant.id);
    await this.audit.log(id ? 'update' : 'create', 'role', roleId, null, dto);
    return (await this.list()).find((r) => r.id === roleId);
  }

  async remove(id: string) {
    const [role] = await this.ctx.db.select().from(t.roles).where(and(eq(t.roles.id, id)));
    if (!role) throw new NotFoundException();
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    await this.ctx.db.delete(t.roles).where(eq(t.roles.id, id));
    this.perms.invalidate(this.ctx.tenant.id);
    await this.audit.log('delete', 'role', id, role, null);
    return { ok: true };
  }
}
