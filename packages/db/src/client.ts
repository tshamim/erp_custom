import { Pool, PoolConfig } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as controlSchema from './control/schema';
import * as tenantSchema from './tenant/schema';

export type ControlDb = NodePgDatabase<typeof controlSchema>;
export type TenantDb = NodePgDatabase<typeof tenantSchema>;

export function createControlDb(url = process.env.CONTROL_DATABASE_URL): { db: ControlDb; pool: Pool } {
  if (!url) throw new Error('CONTROL_DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema: controlSchema }), pool };
}

export function createTenantDb(config: PoolConfig): { db: TenantDb; pool: Pool } {
  const pool = new Pool({ max: 5, idleTimeoutMillis: 60_000, ...config });
  return { db: drizzle(pool, { schema: tenantSchema }), pool };
}
