import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { controlSchema, createTenantDb, tenantPoolConfig, TenantDb } from '@erp/db';
import { CONTROL_DB, ControlDb } from '../control/control.module';
import { config } from '../config';

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
}

interface PoolEntry {
  tenant: ResolvedTenant;
  db: TenantDb;
  pool: Pool;
  lastUsed: number;
}

const META_TTL_MS = 30_000;

/**
 * Keeps one pg Pool per tenant database, bounded by an LRU (TENANT_POOL_MAX).
 * Tenant metadata (status) is re-checked every 30s so suspensions take effect quickly.
 */
@Injectable()
export class TenantConnectionService implements OnApplicationShutdown {
  private readonly logger = new Logger(TenantConnectionService.name);
  private readonly pools = new Map<string, PoolEntry>(); // key: slug
  private readonly meta = new Map<string, { tenant: ResolvedTenant | null; at: number }>();
  private readonly pending = new Map<string, Promise<PoolEntry | null>>();

  constructor(@Inject(CONTROL_DB) private readonly control: ControlDb) {}

  async lookup(slug: string): Promise<ResolvedTenant | null> {
    const cached = this.meta.get(slug);
    if (cached && Date.now() - cached.at < META_TTL_MS) return cached.tenant;
    const [row] = await this.control
      .select({
        id: controlSchema.tenants.id,
        slug: controlSchema.tenants.slug,
        name: controlSchema.tenants.name,
        status: controlSchema.tenants.status,
      })
      .from(controlSchema.tenants)
      .where(eq(controlSchema.tenants.slug, slug));
    const tenant = row ?? null;
    this.meta.set(slug, { tenant, at: Date.now() });
    return tenant;
  }

  /** Returns a Drizzle client bound to the tenant's own database, or null if tenant unknown/inactive. */
  async get(slug: string): Promise<{ tenant: ResolvedTenant; db: TenantDb } | null> {
    const tenant = await this.lookup(slug);
    if (!tenant || tenant.status !== 'active') return null;

    const existing = this.pools.get(slug);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.tenant = tenant;
      return existing;
    }
    let p = this.pending.get(slug);
    if (!p) {
      p = this.open(tenant).finally(() => this.pending.delete(slug));
      this.pending.set(slug, p);
    }
    const entry = await p;
    return entry;
  }

  private async open(tenant: ResolvedTenant): Promise<PoolEntry | null> {
    const [row] = await this.control
      .select()
      .from(controlSchema.tenantDatabases)
      .where(eq(controlSchema.tenantDatabases.tenantId, tenant.id));
    if (!row) return null;
    const { db, pool } = createTenantDb(tenantPoolConfig(row));
    pool.on('error', (err) => this.logger.error(`pool error for ${tenant.slug}: ${err.message}`));
    const entry: PoolEntry = { tenant, db, pool, lastUsed: Date.now() };
    this.pools.set(tenant.slug, entry);
    await this.evictIfNeeded();
    return entry;
  }

  private async evictIfNeeded() {
    while (this.pools.size > config.tenantPoolMax) {
      let oldest: PoolEntry | null = null;
      for (const e of this.pools.values()) if (!oldest || e.lastUsed < oldest.lastUsed) oldest = e;
      if (!oldest) return;
      this.pools.delete(oldest.tenant.slug);
      this.logger.log(`evicting pool for ${oldest.tenant.slug}`);
      await oldest.pool.end().catch(() => undefined);
    }
  }

  /** Drop cached metadata + pool (after suspend / credential rotation). */
  async invalidate(slug: string) {
    this.meta.delete(slug);
    const e = this.pools.get(slug);
    if (e) {
      this.pools.delete(slug);
      await e.pool.end().catch(() => undefined);
    }
  }

  async onApplicationShutdown() {
    await Promise.all([...this.pools.values()].map((e) => e.pool.end().catch(() => undefined)));
  }
}
