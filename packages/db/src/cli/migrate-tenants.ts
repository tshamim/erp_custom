import './env';
import { createControlDb } from '../client';
import { migrateAllTenants } from '../provision';

async function main() {
  const { db, pool } = createControlDb();
  try {
    const results = await migrateAllTenants(db);
    for (const r of results) console.log(r.ok ? `✔ ${r.slug} → ${r.version}` : `✘ ${r.slug}: ${r.error}`);
    console.log(`${results.filter((r) => r.ok).length}/${results.length} tenants migrated`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
