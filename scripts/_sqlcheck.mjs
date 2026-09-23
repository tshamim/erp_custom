import { createTenantDb, tenantSchema as t } from '@erp/db';
import { sql, inArray } from 'drizzle-orm';
const { db, pool } = createTenantDb({ host: 'localhost', port: 5440, database: 'erp_t_acme', user: 'erp', password: 'erp_dev_password' });
const q = db
  .select({
    id: t.parties.id,
    purchases: sql`coalesce((select sum(${t.purchaseOrders.total}) from ${t.purchaseOrders} where ${t.purchaseOrders.partyId} = ${t.parties.id} and ${t.purchaseOrders.status} <> 'cancelled'), 0)`,
  })
  .from(t.parties)
  .where(inArray(t.parties.type, ['vendor', 'subcontractor']));
console.log(q.toSQL().sql);
console.log((await q.limit(3)).map((r) => r.purchases));
await pool.end();
