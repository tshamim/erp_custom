import { pgTable, uuid, varchar, text, timestamp, integer, boolean, pgEnum, jsonb } from 'drizzle-orm/pg-core';

export const tenantStatus = pgEnum('tenant_status', ['provisioning', 'active', 'suspended', 'failed']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 63 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  status: tenantStatus('status').notNull().default('provisioning'),
  plan: varchar('plan', { length: 50 }).notNull().default('standard'),
  contactEmail: varchar('contact_email', { length: 200 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantDatabases = pgTable('tenant_databases', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').notNull(),
  dbName: varchar('db_name', { length: 63 }).notNull().unique(),
  dbUser: varchar('db_user', { length: 63 }).notNull(),
  /** AES-256-GCM ciphertext: iv:tag:data (hex) */
  dbPasswordEnc: text('db_password_enc').notNull(),
  schemaVersion: varchar('schema_version', { length: 100 }),
  lastMigratedAt: timestamp('last_migrated_at', { withTimezone: true }),
});

export const tenantDomains = pgTable('tenant_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  isPrimary: boolean('is_primary').notNull().default(false),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  plan: varchar('plan', { length: 50 }).notNull(),
  maxUsers: integer('max_users').notNull().default(25),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
});

export const provisioningJobs = pgTable('provisioning_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 30 }).notNull(), // provision | migrate
  status: varchar('status', { length: 20 }).notNull(), // running | succeeded | failed
  log: jsonb('log').$type<string[]>().notNull().default([]),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
