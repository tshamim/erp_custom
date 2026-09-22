import { pgTable, varchar, text, boolean, uuid, timestamp, jsonb, integer, primaryKey, index, unique } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_common';

export const branches = pgTable('branches', {
  id: id(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  address: text('address'),
  phone: varchar('phone', { length: 50 }),
  binNo: varchar('bin_no', { length: 30 }), // VAT Business Identification Number
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
});

export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  branchId: uuid('branch_id').references(() => branches.id),
  employeeId: uuid('employee_id'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** Bumped on logout / password change to invalidate refresh tokens. */
  tokenVersion: integer('token_version').notNull().default(0),
  ...timestamps(),
});

export const roles = pgTable('roles', {
  id: id(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  ...timestamps(),
});

export const permissions = pgTable('permissions', {
  key: varchar('key', { length: 100 }).primaryKey(),
  module: varchar('module', { length: 50 }).notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 100 })
      .notNull()
      .references(() => permissions.key, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    userId: uuid('user_id'),
    action: varchar('action', { length: 20 }).notNull(), // create | update | delete | post | approve | login
    entity: varchar('entity', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: varchar('ip', { length: 64 }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.entity, t.entityId), index('audit_at_idx').on(t.at)],
);

/** Document numbering: prefix + year → e.g. PO-2026-00001 */
export const numberSequences = pgTable(
  'number_sequences',
  {
    id: id(),
    docType: varchar('doc_type', { length: 50 }).notNull(),
    prefix: varchar('prefix', { length: 20 }).notNull(),
    year: integer('year').notNull(),
    nextValue: integer('next_value').notNull().default(1),
    padding: integer('padding').notNull().default(5),
  },
  (t) => [unique('number_seq_doc_year').on(t.docType, t.year)],
);

export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    entity: varchar('entity', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }),
    size: integer('size'),
    storageKey: text('storage_key').notNull(),
    uploadedBy: uuid('uploaded_by'),
    ...timestamps(),
  },
  (t) => [index('attach_entity_idx').on(t.entity, t.entityId)],
);

export const settings = pgTable('settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
});

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: id(),
    entity: varchar('entity', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    requestedBy: uuid('requested_by'),
    approverRoleId: uuid('approver_role_id').references(() => roles.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    remarks: text('remarks'),
    ...timestamps(),
  },
  (t) => [index('approval_entity_idx').on(t.entity, t.entityId)],
);

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  link: varchar('link', { length: 255 }),
  readAt: timestamp('read_at', { withTimezone: true }),
  ...timestamps(),
});
