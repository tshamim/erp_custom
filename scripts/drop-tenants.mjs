#!/usr/bin/env node
/**
 * Drops tenants whose slug matches a prefix, including their database and role.
 * Intended for cleaning up e2e test companies:  node scripts/drop-tenants.mjs e2e_ e2p_ --yes
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, '..', '.env') });

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const prefixes = args.filter((a) => !a.startsWith('--'));
if (!prefixes.length) {
  console.error('Usage: node scripts/drop-tenants.mjs <slugPrefix...> [--yes]');
  process.exit(1);
}

const admin = {
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_ADMIN_USER ?? 'postgres',
  password: process.env.PG_ADMIN_PASSWORD ?? '',
};

const control = new pg.Client({ connectionString: process.env.CONTROL_DATABASE_URL });
await control.connect();
const { rows } = await control.query(
  `select t.id, t.slug, t.name, d.db_name, d.db_user
   from tenants t left join tenant_databases d on d.tenant_id = t.id
   where ${prefixes.map((_, i) => `t.slug like $${i + 1}`).join(' or ')}
   order by t.created_at`,
  prefixes.map((p) => `${p}%`),
);

if (!rows.length) {
  console.log('No matching companies.');
} else if (!confirmed) {
  console.log(`Would drop ${rows.length} companies (add --yes to proceed):`);
  rows.forEach((r) => console.log(`  ${r.slug} → ${r.db_name ?? 'no database'}`));
} else {
  const maintenance = new pg.Client({ ...admin, database: 'postgres' });
  await maintenance.connect();
  for (const r of rows) {
    if (r.db_name) {
      await maintenance.query(`DROP DATABASE IF EXISTS "${r.db_name}" WITH (FORCE)`);
      if (r.db_user) await maintenance.query(`DROP ROLE IF EXISTS "${r.db_user}"`);
    }
    await control.query('delete from tenants where id = $1', [r.id]);
    console.log(`dropped ${r.slug}`);
  }
  await maintenance.end();
}
await control.end();
