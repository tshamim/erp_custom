import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { ZodTypeAny } from 'zod';
import { tenantSchema as t, TenantDb } from '@erp/db';
import {
  departmentSchema,
  designationSchema,
  employeeSchema,
  equipmentSchema,
  IMPORT_TEMPLATES,
  ImportResource,
  itemSchema,
  partySchema,
  warehouseSchema,
  zx,
} from '@erp/shared';
import { z } from 'zod';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PermissionCache } from '../../auth/permission-cache.service';
import { StockDocumentsService } from '../inventory/inventory.service';
import { D, m2, q4 } from '../../common/money';
import { longNumber, normalizeAmount as amt, normalizeDate, normalizeEnum as en, normalizeGender, normalizePhone as phone } from './import-normalize';

export interface ImportResult {
  resource: ImportResource;
  total: number;
  valid: number;
  created: number;
  dryRun: boolean;
  errors: { row: number; message: string }[];
}

type Raw = Record<string, string | undefined>;
const clean = (v: string | undefined) => {
  const s = (v ?? '').trim();
  return s === '' ? undefined : s;
};
const yes = (v?: string) => ['yes', 'y', 'true', '1'].includes((v ?? '').trim().toLowerCase());

const boqRow = z.object({ code: z.string().min(1), description: z.string().min(1), uom: z.string().nullish(), quantity: zx.nonNegDecimal.default('0'), rate: zx.nonNegDecimal.default('0'), isSection: z.boolean() });
const stockRow = z.object({ warehouseId: zx.uuid, itemId: zx.uuid, quantity: zx.positiveDecimal, unitCost: zx.nonNegDecimal });

/**
 * Bulk CSV import. All-or-nothing: every row is validated (codes resolved, zod-checked) first;
 * rows are only written when there are no errors, inside one transaction.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly perms: PermissionCache,
    private readonly stockDocs: StockDocumentsService,
  ) {}

  private async lookups(db: TenantDb) {
    /** Keyed by code and, where there is one, by name too, so a file may use either. */
    const map = <T extends { id: string }>(rows: T[], key: (r: T) => string, alt?: (r: T) => string | null) => {
      const m = new Map<string, string>();
      for (const r of rows) {
        const a = alt?.(r);
        if (a) m.set(a.trim().toLowerCase(), r.id);
      }
      for (const r of rows) m.set(key(r).trim().toLowerCase(), r.id);
      return m;
    };
    const [uoms, cats, taxes, depts, desigs, items, whs] = await Promise.all([
      db.select({ id: t.uoms.id, code: t.uoms.code, name: t.uoms.name }).from(t.uoms),
      db.select({ id: t.itemCategories.id, code: t.itemCategories.code, name: t.itemCategories.name }).from(t.itemCategories),
      db.select({ id: t.taxCodes.id, code: t.taxCodes.code }).from(t.taxCodes),
      db.select({ id: t.departments.id, code: t.departments.code, name: t.departments.name }).from(t.departments),
      db.select({ id: t.designations.id, name: t.designations.name }).from(t.designations),
      db.select({ id: t.items.id, code: t.items.code }).from(t.items),
      db.select({ id: t.warehouses.id, code: t.warehouses.code, name: t.warehouses.name }).from(t.warehouses),
    ]);
    return {
      uom: map(uoms, (r) => r.code, (r) => r.name),
      category: map(cats, (r) => r.code, (r) => r.name),
      tax: map(taxes, (r) => r.code),
      dept: map(depts, (r) => r.code, (r) => r.name),
      desig: map(desigs, (r) => r.name),
      item: map(items, (r) => r.code),
      warehouse: map(whs, (r) => r.code, (r) => r.name),
    };
  }

  async run(resource: ImportResource, rows: Raw[], opts: { dryRun: boolean; projectId?: string }): Promise<ImportResult> {
    const tpl = IMPORT_TEMPLATES[resource];
    if (!tpl) throw new BadRequestException('Unknown import type');
    const granted = await this.perms.forUser(this.ctx.tenant.id, this.ctx.userId!, this.ctx.db);
    if (!granted.keys.has(tpl.perm)) throw new ForbiddenException(`Missing permission: ${tpl.perm}`);
    if (rows.length > 5000) throw new BadRequestException('Maximum 5000 rows per import');
    if ('needsProject' in tpl && tpl.needsProject && !opts.projectId) throw new BadRequestException('Select a project for BOQ import');

    const db = this.ctx.db;
    const lk = await this.lookups(db);
    const errors: ImportResult['errors'] = [];
    const parsed: Record<string, unknown>[] = [];
    const ref = (m: Map<string, string>, v: string | undefined, what: string, required = false) => {
      const s = clean(v);
      if (!s) {
        if (required) throw new Error(`${what} is required`);
        return null;
      }
      const id = m.get(s.toLowerCase());
      if (!id) {
        const choices = [...new Set(m.keys())].slice(0, 12).join(', ');
        throw new Error(`Unknown ${what} "${s}" — use one of: ${choices}${m.size > 12 ? ', …' : ''}`);
      }
      return id;
    };

    const shape: Record<ImportResource, { schema: ZodTypeAny; map: (r: Raw) => Record<string, unknown> }> = {
      items: {
        schema: itemSchema,
        map: (r) => ({ code: clean(r.code), name: clean(r.name), uomId: ref(lk.uom, r.unit, 'unit', true), categoryId: ref(lk.category, r.category, 'category'), type: en(r.type) ?? 'stock', reorderLevel: amt(r.reorderLevel) ?? '0', standardCost: amt(r.standardCost) ?? null, specification: clean(r.specification) ?? null, defaultVatCodeId: ref(lk.tax, r.vatCode, 'VAT code') }),
      },
      parties: {
        schema: partySchema,
        map: (r) => ({ type: en(r.type), code: clean(r.code), name: clean(r.name), contactPerson: clean(r.contactPerson) ?? null, phone: phone(r.phone) ?? null, email: clean(r.email) ?? null, address: clean(r.address) ?? null, binNo: clean(r.binNo) ?? null, tin: clean(r.tin) ?? null, vendorCategory: clean(r.vendorCategory) ?? null, paymentTermsDays: amt(r.paymentTermsDays) ?? 30 }),
      },
      employees: {
        schema: employeeSchema,
        map: (r) => ({ code: clean(r.code), firstName: clean(r.firstName), lastName: clean(r.lastName) ?? null, gender: normalizeGender(r.gender) ?? null, phone: phone(r.phone) ?? null, email: clean(r.email) ?? null, nid: longNumber(r.nid, 'NID') ?? null, departmentId: ref(lk.dept, r.department, 'department'), designationId: ref(lk.desig, r.designation, 'designation'), employmentType: en(r.employmentType) ?? 'permanent', joiningDate: normalizeDate(r.joiningDate), dailyWage: amt(r.dailyWage) ?? null, bankAccountNo: longNumber(r.bankAccountNo, 'Bank account') ?? null }),
      },
      departments: { schema: departmentSchema, map: (r) => ({ code: clean(r.code), name: clean(r.name) }) },
      designations: { schema: designationSchema, map: (r) => ({ name: clean(r.name), grade: clean(r.grade) ?? null }) },
      warehouses: { schema: warehouseSchema, map: (r) => ({ code: clean(r.code), name: clean(r.name), type: en(r.type) ?? 'central', address: clean(r.address) ?? null }) },
      equipment: { schema: equipmentSchema, map: (r) => ({ code: clean(r.code), name: clean(r.name), type: clean(r.type) ?? null, ownership: en(r.ownership) ?? 'owned', hourlyRate: amt(r.hourlyRate) ?? '0' }) },
      boq: { schema: boqRow, map: (r) => ({ code: clean(r.code), description: clean(r.description), uom: clean(r.uom) ?? null, quantity: amt(r.quantity) ?? '0', rate: amt(r.rate) ?? '0', isSection: yes(r.isSection) }) },
      'opening-stock': { schema: stockRow, map: (r) => ({ warehouseId: ref(lk.warehouse, r.warehouse, 'warehouse', true), itemId: ref(lk.item, r.item, 'item', true), quantity: amt(r.quantity), unitCost: amt(r.unitCost) }) },
    };

    // Headers retyped by hand ("First Name", "joining date") still find their column.
    const squash = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byKey = new Map<string, string>(tpl.columns.map((c: string) => [squash(c), c]));
    rows = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [byKey.get(squash(k)) ?? k, v])));

    const seen = new Set<string>();
    rows.forEach((raw, i) => {
      const rowNo = i + 2; // header is line 1
      try {
        const res = shape[resource].schema.safeParse(shape[resource].map(raw));
        if (!res.success) throw new Error(res.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`).join('; '));
        const key = (res.data.code ?? res.data.name ?? '') as string;
        if (key && resource !== 'opening-stock') {
          if (seen.has(key.toLowerCase())) throw new Error(`Duplicate "${key}" in file`);
          seen.add(key.toLowerCase());
        }
        parsed.push(res.data);
      } catch (e) {
        errors.push({ row: rowNo, message: (e as Error).message });
      }
    });

    const result: ImportResult = { resource, total: rows.length, valid: parsed.length, created: 0, dryRun: opts.dryRun, errors };
    if (opts.dryRun || errors.length || !parsed.length) return result;

    try {
      await db.transaction(async (tx) => {
        switch (resource) {
          case 'items':
            await tx.insert(t.items).values(parsed as (typeof t.items.$inferInsert)[]);
            break;
          case 'parties':
            for (const p of parsed as Record<string, string>[]) {
              await tx.insert(t.parties).values({ ...(p as unknown as typeof t.parties.$inferInsert), code: p.code || (await this.numbering.next(tx, `party_${p.type}`)), email: p.email || null });
            }
            break;
          case 'employees':
            for (const e of parsed as Record<string, string>[]) {
              const code = e.code || (await this.numbering.next(tx, 'employee', e.joiningDate));
              const [row] = await tx.insert(t.employees).values({ ...(e as unknown as typeof t.employees.$inferInsert), code, email: e.email || null }).returning({ id: t.employees.id });
              await tx.insert(t.employmentHistory).values({ employeeId: row.id, effectiveDate: e.joiningDate, event: 'joined', departmentId: e.departmentId, designationId: e.designationId });
            }
            break;
          case 'departments':
            await tx.insert(t.departments).values(parsed as (typeof t.departments.$inferInsert)[]);
            break;
          case 'designations':
            await tx.insert(t.designations).values(parsed as (typeof t.designations.$inferInsert)[]);
            break;
          case 'warehouses':
            await tx.insert(t.warehouses).values(parsed as (typeof t.warehouses.$inferInsert)[]);
            break;
          case 'equipment':
            await tx.insert(t.equipment).values(parsed as (typeof t.equipment.$inferInsert)[]);
            break;
          case 'boq':
            await tx.insert(t.boqItems).values(
              (parsed as { code: string; description: string; uom: string | null; quantity: string; rate: string; isSection: boolean }[]).map((b, i) => ({
                ...b,
                projectId: opts.projectId!,
                quantity: q4(b.quantity),
                rate: m2(b.rate),
                amount: b.isSection ? '0' : m2(D(b.quantity).times(b.rate)),
                sortOrder: i + 1,
              })),
            );
            break;
          case 'opening-stock': {
            const byWh = new Map<string, { itemId: string; quantity: string; unitCost: string }[]>();
            for (const s of parsed as { warehouseId: string; itemId: string; quantity: string; unitCost: string }[]) {
              byWh.set(s.warehouseId, [...(byWh.get(s.warehouseId) ?? []), s]);
            }
            for (const [warehouseId, lines] of byWh) {
              const id = await this.stockDocs.createIn(tx, { type: 'opening', date: new Date().toISOString().slice(0, 10), toWarehouseId: warehouseId, remarks: 'CSV opening stock import', lines });
              await this.stockDocs.postIn(tx, id);
            }
            break;
          }
        }
      });
    } catch (e) {
      const err = e as { code?: string; detail?: string; cause?: { code?: string; detail?: string }; message: string };
      const code = err.code ?? err.cause?.code;
      if (code === '23505') throw new BadRequestException(`Import rejected — a record already exists: ${err.detail ?? err.cause?.detail ?? ''}`);
      throw e;
    }
    result.created = parsed.length;
    await this.audit.log('import', resource, null, null, { rows: parsed.length });
    return result;
  }

  /** Project must exist for BOQ imports. */
  async assertProject(projectId?: string) {
    if (!projectId) return;
    const [p] = await this.ctx.db.select({ id: t.projects.id }).from(t.projects).where(eq(t.projects.id, projectId));
    if (!p) throw new BadRequestException('Project not found');
  }
}
