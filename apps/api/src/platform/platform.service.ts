import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import {
  controlSchema as c,
  tenantSchema as t,
  provisionTenant,
  adminConnectionFromEnv,
  migrateAllTenants,
  createTenantDb,
  tenantPoolConfig,
  TenantDb,
} from '@erp/db';
import { MODULE_KEYS, MODULES, ModuleKey, type CreateTenantDto } from '@erp/shared';
import { CONTROL_DB, ControlDb } from '../control/control.module';
import { TenantConnectionService } from '../tenancy/tenant-connection.service';
import { TenantModulesService } from '../tenancy/tenant-modules.service';
import { TenantContext } from '../tenancy/tenant-context';
import { PermissionCache } from '../auth/permission-cache.service';
import { AuthService } from '../auth/auth.service';

export interface PlatformActor {
  id: string;
  ip?: string;
}

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    @Inject(CONTROL_DB) private readonly control: ControlDb,
    private readonly connections: TenantConnectionService,
    private readonly modules: TenantModulesService,
    private readonly perms: PermissionCache,
    private readonly ctx: TenantContext,
    private readonly auth: AuthService,
  ) {}

  // ---------------- helpers ----------------

  private async admin(id: string) {
    const [a] = await this.control.select().from(c.platformAdmins).where(eq(c.platformAdmins.id, id));
    if (!a?.isActive) throw new ForbiddenException();
    return a;
  }

  async record(actor: PlatformActor, action: string, tenantId: string | null, details?: unknown) {
    const a = await this.admin(actor.id);
    await this.control.insert(c.platformAuditLogs).values({ adminId: a.id, adminEmail: a.email, action, tenantId, details: details ?? null, ip: actor.ip ?? null });
  }

  private async tenant(id: string) {
    const [tenant] = await this.control.select().from(c.tenants).where(eq(c.tenants.id, id));
    if (!tenant) throw new NotFoundException('Company not found');
    return tenant;
  }

  /** Runs `fn` against a tenant DB: shared pool when active, a short-lived pool otherwise (e.g. suspended). */
  private async withTenantDb<T>(tenantId: string, fn: (db: TenantDb) => Promise<T>): Promise<T | null> {
    const tenant = await this.tenant(tenantId);
    const conn = tenant.status === 'active' ? await this.connections.get(tenant.slug) : null;
    if (conn) return fn(conn.db);
    const [row] = await this.control.select().from(c.tenantDatabases).where(eq(c.tenantDatabases.tenantId, tenantId));
    if (!row) return null;
    const { db, pool } = createTenantDb({ ...tenantPoolConfig(row), max: 1 });
    try {
      return await fn(db);
    } finally {
      await pool.end();
    }
  }

  private async tenantStats(db: TenantDb) {
    const one = async <T>(q: Promise<T[]>) => (await q)[0];
    const [users, employees, projects, sales, purchases, files, activity] = await Promise.all([
      one(db.select({ total: sql<number>`count(*)::int`, active30d: sql<number>`count(*) filter (where ${t.users.lastLoginAt} > now() - interval '30 days')::int` }).from(t.users)),
      one(db.select({ active: sql<number>`count(*) filter (where ${t.employees.status} = 'active')::int` }).from(t.employees)),
      one(
        db
          .select({
            active: sql<number>`count(*) filter (where ${t.projects.status} = 'active')::int`,
            total: sql<number>`count(*)::int`,
            contractValue: sql<string>`coalesce(sum(${t.projects.contractValue}) filter (where ${t.projects.status} in ('active','planning')), 0)`,
          })
          .from(t.projects),
      ),
      one(db.select({ total: sql<string>`coalesce(sum(${t.invoices.subtotal}) filter (where ${t.invoices.status} <> 'cancelled' and ${t.invoices.status} <> 'draft'), 0)`, count: sql<number>`count(*)::int` }).from(t.invoices)),
      one(db.select({ total: sql<string>`coalesce(sum(${t.purchaseOrders.total}) filter (where ${t.purchaseOrders.status} <> 'cancelled'), 0)`, count: sql<number>`count(*)::int` }).from(t.purchaseOrders)),
      one(db.select({ count: sql<number>`count(*)::int`, bytes: sql<string>`coalesce(sum(${t.attachments.size}), 0)` }).from(t.attachments)),
      one(db.select({ lastAt: sql<string | null>`max(${t.auditLogs.at})`, last7d: sql<number>`count(*) filter (where ${t.auditLogs.at} > now() - interval '7 days')::int` }).from(t.auditLogs)),
    ]);
    return { users, employees, projects, sales, purchases, files, activity };
  }

  private async dbSize(dbName: string | null): Promise<number | null> {
    if (!dbName) return null;
    const res = await this.control.execute(sql`select pg_database_size(${dbName})::bigint as size`);
    return Number((res.rows[0] as { size: string }).size);
  }

  private async moduleMap(tenantId: string): Promise<Record<ModuleKey, boolean>> {
    const on = await this.modules.enabled(tenantId);
    return Object.fromEntries(MODULE_KEYS.map((k) => [k, on.has(k)])) as Record<ModuleKey, boolean>;
  }

  // ---------------- reads ----------------

  async list() {
    const rows = await this.control
      .select({
        id: c.tenants.id,
        slug: c.tenants.slug,
        name: c.tenants.name,
        status: c.tenants.status,
        plan: c.tenants.plan,
        contactEmail: c.tenants.contactEmail,
        createdAt: c.tenants.createdAt,
        dbName: c.tenantDatabases.dbName,
        schemaVersion: c.tenantDatabases.schemaVersion,
        lastMigratedAt: c.tenantDatabases.lastMigratedAt,
        modules: sql<string[]>`coalesce((select array_agg(${c.tenantModules.module}) from ${c.tenantModules} where ${c.tenantModules.tenantId} = ${c.tenants.id} and ${c.tenantModules.enabled}), '{}')`,
      })
      .from(c.tenants)
      .leftJoin(c.tenantDatabases, eq(c.tenantDatabases.tenantId, c.tenants.id))
      .orderBy(desc(c.tenants.createdAt));
    return rows;
  }

  /** Cross-tenant dashboard: live stats from every company database. */
  async overview() {
    const tenants = await this.list();
    const perTenant = await Promise.all(
      tenants.map(async (tn) => {
        let stats = null;
        let error: string | null = null;
        if (tn.status === 'active' || tn.status === 'suspended') {
          try {
            stats = await this.withTenantDb(tn.id, (db) => this.tenantStats(db));
          } catch (e) {
            error = (e as Error).message;
          }
        }
        return { ...tn, stats, error, dbSizeBytes: await this.dbSize(tn.dbName).catch(() => null) };
      }),
    );
    const sum = (f: (x: (typeof perTenant)[number]) => number) => perTenant.reduce((a, x) => a + (f(x) || 0), 0);
    const recentActivity = await this.control.select().from(c.platformAuditLogs).orderBy(desc(c.platformAuditLogs.at)).limit(15);
    return {
      totals: {
        tenants: tenants.length,
        active: tenants.filter((x) => x.status === 'active').length,
        suspended: tenants.filter((x) => x.status === 'suspended').length,
        failed: tenants.filter((x) => x.status === 'failed').length,
        users: sum((x) => x.stats?.users.total ?? 0),
        activeUsers30d: sum((x) => x.stats?.users.active30d ?? 0),
        employees: sum((x) => x.stats?.employees.active ?? 0),
        activeProjects: sum((x) => x.stats?.projects.active ?? 0),
        contractValue: sum((x) => Number(x.stats?.projects.contractValue ?? 0)),
        sales: sum((x) => Number(x.stats?.sales.total ?? 0)),
        storageBytes: sum((x) => Number(x.stats?.files.bytes ?? 0)),
        dbBytes: sum((x) => x.dbSizeBytes ?? 0),
      },
      moduleAdoption: MODULE_KEYS.map((k) => ({ module: k, label: MODULES[k].label, tenants: tenants.filter((x) => x.modules.includes(k)).length })),
      tenants: perTenant,
      recentActivity,
    };
  }

  async get(id: string) {
    const tenant = await this.tenant(id);
    const [db] = await this.control
      .select({ dbName: c.tenantDatabases.dbName, host: c.tenantDatabases.host, schemaVersion: c.tenantDatabases.schemaVersion, lastMigratedAt: c.tenantDatabases.lastMigratedAt })
      .from(c.tenantDatabases)
      .where(eq(c.tenantDatabases.tenantId, id));
    const jobs = await this.control.select().from(c.provisioningJobs).where(eq(c.provisioningJobs.tenantId, id)).orderBy(desc(c.provisioningJobs.startedAt));
    const [subscription] = await this.control.select().from(c.subscriptions).where(eq(c.subscriptions.tenantId, id)).orderBy(desc(c.subscriptions.startsAt)).limit(1);
    const platformAudit = await this.control.select().from(c.platformAuditLogs).where(eq(c.platformAuditLogs.tenantId, id)).orderBy(desc(c.platformAuditLogs.at)).limit(50);

    let stats = null;
    let users: unknown[] = [];
    let recentAudit: unknown[] = [];
    if (db && tenant.status !== 'provisioning' && tenant.status !== 'failed') {
      const detail = await this.withTenantDb(id, async (tdb) => ({
        stats: await this.tenantStats(tdb),
        users: await tdb
          .select({
            id: t.users.id,
            name: t.users.name,
            email: t.users.email,
            isActive: t.users.isActive,
            lastLoginAt: t.users.lastLoginAt,
            // Explicit prefixes: Drizzle renders bare column names in a join-less select.
            roles: sql<string[]>`coalesce((select array_agg(r.name) from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = users.id), '{}')`,
          })
          .from(t.users)
          .orderBy(t.users.name),
        recentAudit: await tdb
          .select({ id: t.auditLogs.id, at: t.auditLogs.at, action: t.auditLogs.action, entity: t.auditLogs.entity, userName: t.users.name, impersonatedBy: t.auditLogs.impersonatedBy })
          .from(t.auditLogs)
          .leftJoin(t.users, eq(t.users.id, t.auditLogs.userId))
          .orderBy(desc(t.auditLogs.at))
          .limit(30),
      }));
      if (detail) ({ stats, users, recentAudit } = detail);
    }
    return {
      ...tenant,
      database: db ? { ...db, sizeBytes: await this.dbSize(db.dbName).catch(() => null) } : null,
      modules: await this.moduleMap(id),
      subscription: subscription ?? null,
      stats,
      users,
      recentAudit,
      jobs,
      platformAudit,
    };
  }

  platformAudit(limit = 200) {
    return this.control.select().from(c.platformAuditLogs).orderBy(desc(c.platformAuditLogs.at)).limit(limit);
  }

  // ---------------- writes ----------------

  /** Inserts the tenant row and provisions its database in the background. Poll GET /platform/tenants/:id. */
  async create(dto: CreateTenantDto, actor: PlatformActor) {
    const [exists] = await this.control.select({ id: c.tenants.id }).from(c.tenants).where(eq(c.tenants.slug, dto.slug));
    if (exists) throw new ConflictException(`Company ID "${dto.slug}" is taken`);
    const wanted = (dto.modules ?? MODULE_KEYS).filter((m): m is ModuleKey => MODULE_KEYS.includes(m as ModuleKey));
    const [tenant] = await this.control
      .insert(c.tenants)
      .values({ slug: dto.slug, name: dto.name, plan: dto.plan, contactEmail: dto.contactEmail, contactPhone: dto.contactPhone })
      .returning();
    await this.control.insert(c.subscriptions).values({ tenantId: tenant.id, plan: dto.plan });
    await this.modules.set(tenant.id, Object.fromEntries(MODULE_KEYS.map((k) => [k, wanted.includes(k)])));
    await this.record(actor, 'tenant.create', tenant.id, { slug: dto.slug, modules: wanted });

    void provisionTenant(this.control, adminConnectionFromEnv(), tenant.id, { email: dto.adminEmail, name: dto.adminName, password: dto.adminPassword })
      .then(() => this.connections.invalidate(tenant.slug))
      .catch((e) => this.logger.error(`provisioning ${tenant.slug} failed: ${e.message}`));
    return tenant;
  }

  async setStatus(id: string, status: 'active' | 'suspended', actor: PlatformActor) {
    const current = await this.tenant(id);
    const allowedFrom = status === 'active' ? 'suspended' : 'active';
    if (current.status !== allowedFrom) throw new ConflictException(`Cannot change status from ${current.status} to ${status}`);
    const [tenant] = await this.control.update(c.tenants).set({ status, updatedAt: new Date() }).where(eq(c.tenants.id, id)).returning();
    await this.connections.invalidate(tenant.slug);
    await this.record(actor, `tenant.${status === 'active' ? 'activate' : 'suspend'}`, id);
    return tenant;
  }

  async setModules(id: string, modules: Record<string, boolean>, actor: PlatformActor) {
    await this.tenant(id);
    const before = await this.moduleMap(id);
    await this.modules.set(id, modules);
    this.perms.invalidate(id);
    const after = await this.moduleMap(id);
    await this.record(actor, 'tenant.modules', id, { before, after });
    return after;
  }

  async setSubscription(id: string, dto: { plan: string; maxUsers: number; endsAt?: string | null }, actor: PlatformActor) {
    await this.tenant(id);
    const [sub] = await this.control.select().from(c.subscriptions).where(eq(c.subscriptions.tenantId, id)).orderBy(desc(c.subscriptions.startsAt)).limit(1);
    const values = { plan: dto.plan, maxUsers: dto.maxUsers, endsAt: dto.endsAt ? new Date(dto.endsAt) : null };
    const [row] = sub
      ? await this.control.update(c.subscriptions).set(values).where(eq(c.subscriptions.id, sub.id)).returning()
      : await this.control.insert(c.subscriptions).values({ tenantId: id, ...values }).returning();
    await this.control.update(c.tenants).set({ plan: dto.plan, updatedAt: new Date() }).where(eq(c.tenants.id, id));
    await this.record(actor, 'tenant.subscription', id, values);
    return row;
  }

  /** "Login as tenant": issues a 1-hour token for a tenant user, fully audited on both sides. */
  async impersonate(id: string, dto: { userId?: string; reason: string }, actor: PlatformActor) {
    const tenant = await this.tenant(id);
    if (tenant.status !== 'active') throw new BadRequestException(`Company is ${tenant.status}`);
    const conn = await this.connections.get(tenant.slug);
    if (!conn) throw new BadRequestException('Company database unavailable');
    const admin = await this.admin(actor.id);
    this.ctx.bindTenant(conn.tenant, conn.db);
    const result = await this.auth.impersonate({ id: admin.id, email: admin.email }, dto.userId);
    await this.record(actor, 'tenant.impersonate', id, { userId: result.profile.user.id, userEmail: result.profile.user.email, reason: dto.reason });
    return { ...result, tenant: { slug: tenant.slug, name: tenant.name } };
  }

  async migrateAll(actor: PlatformActor) {
    const results = await migrateAllTenants(this.control);
    await this.record(actor, 'tenants.migrate', null, results);
    return results;
  }
}
