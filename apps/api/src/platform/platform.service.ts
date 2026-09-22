import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { controlSchema as c, provisionTenant, adminConnectionFromEnv, migrateAllTenants } from '@erp/db';
import type { CreateTenantDto } from '@erp/shared';
import { CONTROL_DB, ControlDb } from '../control/control.module';
import { TenantConnectionService } from '../tenancy/tenant-connection.service';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    @Inject(CONTROL_DB) private readonly control: ControlDb,
    private readonly connections: TenantConnectionService,
  ) {}

  list() {
    return this.control
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
      })
      .from(c.tenants)
      .leftJoin(c.tenantDatabases, eq(c.tenantDatabases.tenantId, c.tenants.id))
      .orderBy(desc(c.tenants.createdAt));
  }

  async get(id: string) {
    const [tenant] = await this.control.select().from(c.tenants).where(eq(c.tenants.id, id));
    if (!tenant) throw new NotFoundException();
    const [db] = await this.control
      .select({ dbName: c.tenantDatabases.dbName, host: c.tenantDatabases.host, schemaVersion: c.tenantDatabases.schemaVersion })
      .from(c.tenantDatabases)
      .where(eq(c.tenantDatabases.tenantId, id));
    const jobs = await this.control
      .select()
      .from(c.provisioningJobs)
      .where(eq(c.provisioningJobs.tenantId, id))
      .orderBy(desc(c.provisioningJobs.startedAt));
    return { ...tenant, database: db ?? null, jobs };
  }

  /** Inserts the tenant row and provisions its database in the background. Poll GET /platform/tenants/:id. */
  async create(dto: CreateTenantDto) {
    const [exists] = await this.control.select({ id: c.tenants.id }).from(c.tenants).where(eq(c.tenants.slug, dto.slug));
    if (exists) throw new ConflictException(`Company ID "${dto.slug}" is taken`);
    const [tenant] = await this.control
      .insert(c.tenants)
      .values({ slug: dto.slug, name: dto.name, plan: dto.plan, contactEmail: dto.contactEmail, contactPhone: dto.contactPhone })
      .returning();
    await this.control.insert(c.subscriptions).values({ tenantId: tenant.id, plan: dto.plan });

    void provisionTenant(this.control, adminConnectionFromEnv(), tenant.id, {
      email: dto.adminEmail,
      name: dto.adminName,
      password: dto.adminPassword,
    })
      .then(() => this.connections.invalidate(tenant.slug))
      .catch((e) => this.logger.error(`provisioning ${tenant.slug} failed: ${e.message}`));
    return tenant;
  }

  async setStatus(id: string, status: 'active' | 'suspended') {
    const [current] = await this.control.select().from(c.tenants).where(eq(c.tenants.id, id));
    if (!current) throw new NotFoundException();
    const allowedFrom = status === 'active' ? 'suspended' : 'active';
    if (current.status !== allowedFrom) {
      throw new ConflictException(`Cannot change status from ${current.status} to ${status}`);
    }
    const [tenant] = await this.control
      .update(c.tenants)
      .set({ status, updatedAt: new Date() })
      .where(eq(c.tenants.id, id))
      .returning();
    await this.connections.invalidate(tenant.slug);
    return tenant;
  }

  migrateAll() {
    return migrateAllTenants(this.control);
  }
}
