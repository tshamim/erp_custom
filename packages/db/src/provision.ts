import path from 'path';
import { Client } from 'pg';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { ControlDb, TenantDb } from './client';
import { createTenantDb } from './client';
import { tenants, tenantDatabases, provisioningJobs } from './control/schema';
import { encryptSecret, decryptSecret, randomPassword } from './crypto';
import { seedTenant, syncPermissions, SeedAdmin } from './seed/seed-tenant';

export const TENANT_MIGRATIONS = path.join(__dirname, '..', 'migrations', 'tenant');
export const CONTROL_MIGRATIONS = path.join(__dirname, '..', 'migrations', 'control');

export const SLUG_RE = /^[a-z][a-z0-9_]{2,39}$/;

export interface AdminConnection {
  host: string;
  port: number;
  user: string;
  password: string;
}

export function adminConnectionFromEnv(): AdminConnection {
  return {
    host: process.env.PG_HOST ?? 'localhost',
    port: Number(process.env.PG_PORT ?? 5432),
    user: process.env.PG_ADMIN_USER ?? 'postgres',
    password: process.env.PG_ADMIN_PASSWORD ?? '',
  };
}

export type TenantDbRow = typeof tenantDatabases.$inferSelect;

/**
 * Connection for a tenant database. TENANT_DB_HOST / TENANT_DB_PORT override what was stored at
 * provisioning time, so the same rows work from the host (localhost:5440) and from inside a
 * container on the compose network (postgres:5432).
 */
export function tenantPoolConfig(row: TenantDbRow) {
  return {
    host: process.env.TENANT_DB_HOST || row.host,
    port: Number(process.env.TENANT_DB_PORT || row.port),
    database: row.dbName,
    user: row.dbUser,
    password: decryptSecret(row.dbPasswordEnc),
  };
}

async function latestMigrationTag(db: TenantDb): Promise<string | null> {
  const res = await db.execute(
    sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`,
  );
  const row = res.rows[0] as { created_at?: string | number } | undefined;
  return row?.created_at != null ? String(row.created_at) : null;
}

/**
 * Creates a dedicated Postgres role + database for the tenant, runs tenant migrations and seeds defaults.
 * The tenant row must already exist with status 'provisioning'.
 */
export async function provisionTenant(
  control: ControlDb,
  admin: AdminConnection,
  tenantId: string,
  seedAdmin: SeedAdmin,
): Promise<void> {
  const [tenant] = await control.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  if (!SLUG_RE.test(tenant.slug)) throw new Error(`Invalid tenant slug: ${tenant.slug}`);

  const [job] = await control
    .insert(provisioningJobs)
    .values({ tenantId, kind: 'provision', status: 'running', log: [] })
    .returning();
  const log: string[] = [];
  const step = async (msg: string) => {
    log.push(`${new Date().toISOString()} ${msg}`);
    await control.update(provisioningJobs).set({ log }).where(eq(provisioningJobs.id, job.id));
  };

  const dbName = `erp_t_${tenant.slug}`;
  const dbUser = `erp_t_${tenant.slug}`;
  const password = randomPassword();

  try {
    // Identifiers are validated by SLUG_RE; password is base64url so safe inside a literal.
    const pg = new Client({ ...admin, database: 'postgres' });
    await pg.connect();
    try {
      const roleExists = await pg.query('select 1 from pg_roles where rolname = $1', [dbUser]);
      if (roleExists.rowCount) {
        await pg.query(`ALTER ROLE "${dbUser}" WITH LOGIN PASSWORD '${password}'`);
      } else {
        await pg.query(`CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${password}'`);
      }
      await step(`role ${dbUser} ready`);
      const dbExists = await pg.query('select 1 from pg_database where datname = $1', [dbName]);
      if (dbExists.rowCount) throw new Error(`Database ${dbName} already exists`);
      await pg.query(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`);
      await pg.query(`REVOKE ALL ON DATABASE "${dbName}" FROM PUBLIC`);
      await step(`database ${dbName} created`);
    } finally {
      await pg.end();
    }

    await control
      .insert(tenantDatabases)
      .values({
        tenantId,
        host: admin.host,
        port: admin.port,
        dbName,
        dbUser,
        dbPasswordEnc: encryptSecret(password),
      })
      .onConflictDoUpdate({
        target: tenantDatabases.tenantId,
        set: { dbName, dbUser, dbPasswordEnc: encryptSecret(password) },
      });

    const { db, pool } = createTenantDb({ host: admin.host, port: admin.port, database: dbName, user: dbUser, password });
    try {
      await migrate(db, { migrationsFolder: TENANT_MIGRATIONS });
      await step('migrations applied');
      await seedTenant(db, seedAdmin, tenant.name);
      await step('defaults seeded (BD chart of accounts, tax codes, roles, admin user)');
      const version = await latestMigrationTag(db);
      await control
        .update(tenantDatabases)
        .set({ schemaVersion: version, lastMigratedAt: new Date() })
        .where(eq(tenantDatabases.tenantId, tenantId));
    } finally {
      await pool.end();
    }

    await control.update(tenants).set({ status: 'active', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    await step('tenant active');
    await control
      .update(provisioningJobs)
      .set({ status: 'succeeded', finishedAt: new Date() })
      .where(eq(provisioningJobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await step(`FAILED: ${message}`);
    await control.update(tenants).set({ status: 'failed', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    await control
      .update(provisioningJobs)
      .set({ status: 'failed', error: message, finishedAt: new Date() })
      .where(eq(provisioningJobs.id, job.id));
    throw err;
  }
}

export interface MigrateResult {
  slug: string;
  ok: boolean;
  version?: string | null;
  error?: string;
}

/** Applies pending tenant migrations to every active tenant. Continues past failures. */
export async function migrateAllTenants(control: ControlDb): Promise<MigrateResult[]> {
  const rows = await control
    .select({ tenant: tenants, db: tenantDatabases })
    .from(tenants)
    .innerJoin(tenantDatabases, eq(tenantDatabases.tenantId, tenants.id))
    .where(eq(tenants.status, 'active'));

  const results: MigrateResult[] = [];
  for (const { tenant, db: row } of rows) {
    const { db, pool } = createTenantDb(tenantPoolConfig(row));
    try {
      await migrate(db, { migrationsFolder: TENANT_MIGRATIONS });
      await syncPermissions(db);
      const version = await latestMigrationTag(db);
      await control
        .update(tenantDatabases)
        .set({ schemaVersion: version, lastMigratedAt: new Date() })
        .where(eq(tenantDatabases.tenantId, tenant.id));
      results.push({ slug: tenant.slug, ok: true, version });
    } catch (err) {
      results.push({ slug: tenant.slug, ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      await pool.end();
    }
  }
  return results;
}
