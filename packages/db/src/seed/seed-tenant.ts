import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { PERMISSIONS, DEFAULT_ROLES } from '@erp/shared';
import type { TenantDb } from '../client';
import * as t from '../tenant/schema';
import {
  CHART_OF_ACCOUNTS,
  ACCOUNT_MAPPINGS,
  TAX_CODES,
  UOMS,
  ITEM_CATEGORIES,
  LEAVE_TYPES,
  DEFAULT_SETTINGS,
} from './bd-defaults';

/** Inserts any permission keys missing from the tenant DB and grants them to the Admin role. Idempotent. */
export async function syncPermissions(db: TenantDb): Promise<void> {
  await db
    .insert(t.permissions)
    .values(PERMISSIONS.map((key) => ({ key, module: key.split('.')[0] })))
    .onConflictDoNothing();
  const [admin] = await db.select().from(t.roles).where(eq(t.roles.name, 'Admin'));
  if (admin) {
    await db
      .insert(t.rolePermissions)
      .values(PERMISSIONS.map((permissionKey) => ({ roleId: admin.id, permissionKey })))
      .onConflictDoNothing();
  }
}

/** Bangladesh fiscal year containing `today` (Jul 1 – Jun 30). */
export function currentFiscalYear(today = new Date()) {
  const y = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return {
    name: `FY${y}-${String(y + 1).slice(2)}`,
    startDate: `${y}-07-01`,
    endDate: `${y + 1}-06-30`,
    startYear: y,
  };
}

export interface SeedAdmin {
  email: string;
  name: string;
  password: string;
}

export async function seedTenant(db: TenantDb, admin: SeedAdmin, companyName: string): Promise<void> {
  await db.transaction(async (tx) => {
    const d = tx as unknown as TenantDb;

    // Roles & permissions
    await d.insert(t.permissions).values(PERMISSIONS.map((key) => ({ key, module: key.split('.')[0] })));
    const roleIds: Record<string, string> = {};
    for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
      const [r] = await d
        .insert(t.roles)
        .values({ name, description: def.description, isSystem: true })
        .returning({ id: t.roles.id });
      roleIds[name] = r.id;
      const keys = def.permissions === '*' ? [...PERMISSIONS] : def.permissions;
      if (keys.length) await d.insert(t.rolePermissions).values(keys.map((permissionKey) => ({ roleId: r.id, permissionKey })));
    }

    // Head office branch + admin user
    const [branch] = await d
      .insert(t.branches)
      .values({ code: 'HO', name: `${companyName} - Head Office` })
      .returning({ id: t.branches.id });
    const [user] = await d
      .insert(t.users)
      .values({ email: admin.email.toLowerCase(), name: admin.name, passwordHash: await hash(admin.password), branchId: branch.id })
      .returning({ id: t.users.id });
    await d.insert(t.userRoles).values({ userId: user.id, roleId: roleIds.Admin });

    // Chart of accounts (parents first — list is ordered)
    const accountIds: Record<string, string> = {};
    for (const a of CHART_OF_ACCOUNTS) {
      const [row] = await d
        .insert(t.accounts)
        .values({
          code: a.code,
          name: a.name,
          type: a.type,
          subtype: a.subtype ?? null,
          isGroup: !!a.group,
          parentId: a.parent ? accountIds[a.parent] : null,
        })
        .returning({ id: t.accounts.id });
      accountIds[a.code] = row.id;
    }
    await d
      .insert(t.accountMappings)
      .values(Object.entries(ACCOUNT_MAPPINGS).map(([key, code]) => ({ key, accountId: accountIds[code] })));

    await d.insert(t.taxCodes).values(
      TAX_CODES.map((tc) => ({
        code: tc.code,
        name: tc.name,
        kind: tc.kind,
        rate: tc.rate,
        section: 'section' in tc ? tc.section : null,
        accountId: accountIds[ACCOUNT_MAPPINGS[tc.mapping]],
      })),
    );

    // Fiscal year + monthly periods
    const fy = currentFiscalYear();
    const [fyRow] = await d
      .insert(t.fiscalYears)
      .values({ name: fy.name, startDate: fy.startDate, endDate: fy.endDate })
      .returning({ id: t.fiscalYears.id });
    const periods = Array.from({ length: 12 }, (_, i) => {
      const start = new Date(Date.UTC(fy.startYear, 6 + i, 1));
      const end = new Date(Date.UTC(fy.startYear, 7 + i, 0));
      const iso = (x: Date) => x.toISOString().slice(0, 10);
      return { fiscalYearId: fyRow.id, name: iso(start).slice(0, 7), startDate: iso(start), endDate: iso(end) };
    });
    await d.insert(t.fiscalPeriods).values(periods);

    // Inventory masters
    await d.insert(t.uoms).values(UOMS.map(([code, name]) => ({ code, name })));
    await d.insert(t.itemCategories).values(
      ITEM_CATEGORIES.map(([code, name]) => ({
        code,
        name,
        inventoryAccountId: accountIds['1150'],
        expenseAccountId: accountIds['5100'],
      })),
    );
    await d.insert(t.warehouses).values({ code: 'CS', name: 'Central Store', type: 'central' });

    // HR masters
    await d.insert(t.leaveTypes).values(LEAVE_TYPES);
    await d.insert(t.departments).values([
      { code: 'ADM', name: 'Administration' },
      { code: 'ACC', name: 'Accounts & Finance' },
      { code: 'ENG', name: 'Engineering' },
      { code: 'PRC', name: 'Procurement' },
      { code: 'SITE', name: 'Site Operations' },
    ]);
    await d.insert(t.designations).values(
      ['Managing Director', 'Project Manager', 'Site Engineer', 'Accountant', 'Store Keeper', 'Foreman', 'Mason', 'Helper', 'Electrician', 'Plumber'].map(
        (name) => ({ name }),
      ),
    );

    await d.insert(t.settings).values([
      ...Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })),
      { key: 'company.name', value: companyName },
    ]);
  });
}
