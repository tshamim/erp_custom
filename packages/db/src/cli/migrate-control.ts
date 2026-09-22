import './env';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { hash } from '@node-rs/argon2';
import { createControlDb } from '../client';
import { CONTROL_MIGRATIONS } from '../provision';
import { platformAdmins } from '../control/schema';

async function main() {
  const { db, pool } = createControlDb();
  try {
    await migrate(db, { migrationsFolder: CONTROL_MIGRATIONS });
    console.log('control migrations applied');

    const email = process.env.PLATFORM_ADMIN_EMAIL;
    const password = process.env.PLATFORM_ADMIN_PASSWORD;
    if (email && password) {
      const inserted = await db
        .insert(platformAdmins)
        .values({ email: email.toLowerCase(), name: 'Platform Admin', passwordHash: await hash(password) })
        .onConflictDoNothing()
        .returning({ id: platformAdmins.id });
      console.log(inserted.length ? `platform admin ${email} created` : `platform admin ${email} already exists`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
