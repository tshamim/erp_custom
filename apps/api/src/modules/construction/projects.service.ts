import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { BoqItemDto, ListQuery, ProjectDto, ProjectTaskDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { D, Decimal, m2, q4, sum } from '../../common/money';
import { searchClause } from '../../common/pagination';

export const COST_CATEGORIES = ['material', 'labor', 'subcontract', 'equipment', 'overhead'] as const;
type CostCategory = (typeof COST_CATEGORIES)[number];

/** Weighted progress of leaf tasks (0..100). Pure. */
export function rollupProgress(tasks: { id: string; parentId: string | null; progress: string; weight: string }[]): number {
  const parents = new Set(tasks.map((t) => t.parentId).filter(Boolean));
  const leaves = tasks.filter((t) => !parents.has(t.id));
  const w = sum(leaves.map((l) => l.weight));
  if (w.isZero()) return 0;
  return sum(leaves.map((l) => D(l.progress).times(l.weight))).dividedBy(w).toDecimalPlaces(2).toNumber();
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.projects.code, t.projects.name, t.projects.location, t.projects.contractNo]),
      q.status ? eq(t.projects.status, q.status) : undefined,
    );
    const cost = sql<string>`coalesce((select sum(${t.journalLines.debit} - ${t.journalLines.credit}) from ${t.journalLines}
      join ${t.accounts} on ${t.accounts.id} = ${t.journalLines.accountId}
      join ${t.journalEntries} on ${t.journalEntries.id} = ${t.journalLines.entryId}
      where ${t.journalLines.projectId} = ${t.projects.id} and ${t.accounts.type} = 'expense' and ${t.journalEntries.status} in ('posted','reversed')), 0)`;
    const billed = sql<string>`coalesce((select sum(${t.raBills.grossAmount}) from ${t.raBills}
      where ${t.raBills.projectId} = ${t.projects.id} and ${t.raBills.status} = 'approved'), 0)`;
    const data = await db
      .select({
        id: t.projects.id,
        code: t.projects.code,
        name: t.projects.name,
        clientName: t.parties.name,
        location: t.projects.location,
        status: t.projects.status,
        startDate: t.projects.startDate,
        endDate: t.projects.endDate,
        contractValue: t.projects.contractValue,
        cost,
        billed,
      })
      .from(t.projects)
      .leftJoin(t.parties, eq(t.parties.id, t.projects.clientId))
      .where(where)
      .orderBy(desc(t.projects.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.projects).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ p: t.projects, clientName: t.parties.name, pmFirst: t.employees.firstName, pmLast: t.employees.lastName })
      .from(t.projects)
      .leftJoin(t.parties, eq(t.parties.id, t.projects.clientId))
      .leftJoin(t.employees, eq(t.employees.id, t.projects.projectManagerId))
      .where(eq(t.projects.id, id));
    if (!row) throw new NotFoundException();
    const warehouses = await db.select().from(t.warehouses).where(eq(t.warehouses.projectId, id));
    return { ...row.p, clientName: row.clientName, projectManagerName: row.pmFirst ? `${row.pmFirst} ${row.pmLast ?? ''}`.trim() : null, warehouses };
  }

  async create(dto: ProjectDto) {
    const { createSiteStore, ...data } = dto;
    const id = await this.ctx.db.transaction(async (tx) => {
      const [p] = await tx.insert(t.projects).values(data).returning({ id: t.projects.id });
      if (createSiteStore) {
        await tx.insert(t.warehouses).values({ code: `S-${dto.code}`.slice(0, 20), name: `${dto.name} - Site Store`, type: 'site', projectId: p.id, address: dto.location });
      }
      return p.id;
    });
    await this.audit.log('create', 'project', id, null, dto);
    return this.get(id);
  }

  async update(id: string, dto: Partial<ProjectDto>) {
    const before = await this.get(id);
    const { createSiteStore: _ignored, ...data } = dto;
    await this.ctx.db.update(t.projects).set(data).where(eq(t.projects.id, id));
    const after = await this.get(id);
    await this.audit.log('update', 'project', id, before, after);
    return after;
  }

  async setBudgets(projectId: string, budgets: { category: string; amount: string; notes?: string | null }[]) {
    await this.get(projectId);
    await this.ctx.db.transaction(async (tx) => {
      for (const b of budgets) {
        await tx
          .insert(t.projectBudgets)
          .values({ projectId, category: b.category, amount: m2(b.amount), notes: b.notes })
          .onConflictDoUpdate({ target: [t.projectBudgets.projectId, t.projectBudgets.category], set: { amount: m2(b.amount), notes: b.notes } });
      }
    });
    await this.audit.log('update', 'project_budget', projectId, null, budgets);
    return this.summary(projectId);
  }

  /** Maps expense accounts to cost categories using posting-role mappings and item-category expense accounts. */
  private async categoryByAccount(db: TenantDb): Promise<Map<string, CostCategory>> {
    const mappings = await db.select().from(t.accountMappings);
    const cats = await db.select({ exp: t.itemCategories.expenseAccountId }).from(t.itemCategories);
    const m = new Map<string, CostCategory>();
    const keyToCat: Record<string, CostCategory> = {
      material_cost: 'material',
      labor_cost: 'labor',
      salary_expense: 'labor',
      pf_expense: 'labor',
      bonus_expense: 'labor',
      subcontract_cost: 'subcontract',
      equipment_cost: 'equipment',
    };
    for (const r of mappings) if (keyToCat[r.key]) m.set(r.accountId, keyToCat[r.key]);
    for (const c of cats) if (c.exp && !m.has(c.exp)) m.set(c.exp, 'material');
    return m;
  }

  /** Budget vs actual (from GL, tagged by project), revenue, billing, progress. */
  async summary(id: string) {
    const db = this.ctx.db;
    const project = await this.get(id);
    const budgets = await db.select().from(t.projectBudgets).where(eq(t.projectBudgets.projectId, id));
    const catOf = await this.categoryByAccount(db);
    const byAccount = await db
      .select({
        accountId: t.journalLines.accountId,
        type: t.accounts.type,
        net: sql<string>`sum(${t.journalLines.debit} - ${t.journalLines.credit})`,
      })
      .from(t.journalLines)
      .innerJoin(t.accounts, eq(t.accounts.id, t.journalLines.accountId))
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .where(and(eq(t.journalLines.projectId, id), sql`${t.journalEntries.status} in ('posted','reversed')`, inArray(t.accounts.type, ['expense', 'income'])))
      .groupBy(t.journalLines.accountId, t.accounts.type);

    const actual: Record<CostCategory, Decimal> = { material: new Decimal(0), labor: new Decimal(0), subcontract: new Decimal(0), equipment: new Decimal(0), overhead: new Decimal(0) };
    let revenue = new Decimal(0);
    for (const r of byAccount) {
      if (r.type === 'income') revenue = revenue.minus(D(r.net));
      else actual[catOf.get(r.accountId) ?? 'overhead'] = actual[catOf.get(r.accountId) ?? 'overhead'].plus(D(r.net));
    }
    const [equip] = await db
      .select({ cost: sql<string>`coalesce(sum(${t.equipmentLogs.cost}), 0)`, hours: sql<string>`coalesce(sum(${t.equipmentLogs.hours}), 0)` })
      .from(t.equipmentLogs)
      .where(eq(t.equipmentLogs.projectId, id));
    const [ra] = await db
      .select({ gross: sql<string>`coalesce(sum(${t.raBills.grossAmount}), 0)`, retention: sql<string>`coalesce(sum(${t.raBills.retentionAmount}), 0)`, advance: sql<string>`coalesce(sum(${t.raBills.advanceRecovery}), 0)` })
      .from(t.raBills)
      .where(and(eq(t.raBills.projectId, id), eq(t.raBills.status, 'approved')));
    const [boq] = await db
      .select({ total: sql<string>`coalesce(sum(${t.boqItems.amount}) filter (where not ${t.boqItems.isSection}), 0)`, executed: sql<string>`coalesce(sum(${t.boqItems.executedQty} * ${t.boqItems.rate}) filter (where not ${t.boqItems.isSection}), 0)` })
      .from(t.boqItems)
      .where(eq(t.boqItems.projectId, id));
    const tasks = await db.select({ id: t.projectTasks.id, parentId: t.projectTasks.parentId, progress: t.projectTasks.progress, weight: t.projectTasks.weight }).from(t.projectTasks).where(eq(t.projectTasks.projectId, id));
    const [vo] = await db
      .select({ approved: sql<string>`coalesce(sum(${t.variationOrders.amount}) filter (where ${t.variationOrders.status} = 'approved'), 0)` })
      .from(t.variationOrders)
      .where(eq(t.variationOrders.projectId, id));

    const totalCost = sum(Object.values(actual));
    const totalBudget = sum(budgets.map((b) => b.amount));
    return {
      project,
      categories: COST_CATEGORIES.map((c) => {
        const budget = D(budgets.find((b) => b.category === c)?.amount);
        return { category: c, budget: m2(budget), actual: m2(actual[c]), variance: m2(budget.minus(actual[c])) };
      }),
      totals: {
        budget: m2(totalBudget),
        cost: m2(totalCost),
        revenue: m2(revenue),
        profit: m2(revenue.minus(totalCost)),
        billedGross: m2(ra.gross),
        retentionHeld: m2(ra.retention),
        advanceRecovered: m2(ra.advance),
        advanceOutstanding: m2(D(project.mobilizationAdvance).minus(ra.advance)),
        boqValue: m2(boq.total),
        boqExecutedValue: m2(boq.executed),
        approvedVariations: m2(vo.approved),
        equipmentUsageCost: m2(equip.cost),
        equipmentHours: q4(equip.hours),
      },
      physicalProgress: rollupProgress(tasks),
      financialProgress: D(boq.total).isZero() ? 0 : D(boq.executed).dividedBy(boq.total).times(100).toDecimalPlaces(2).toNumber(),
    };
  }

  // ---------------- BOQ ----------------

  async boq(projectId: string) {
    return this.ctx.db.select().from(t.boqItems).where(eq(t.boqItems.projectId, projectId)).orderBy(asc(t.boqItems.sortOrder), asc(t.boqItems.code));
  }

  async boqItem(id: string) {
    const [item] = await this.ctx.db.select().from(t.boqItems).where(eq(t.boqItems.id, id));
    if (!item) throw new NotFoundException();
    const materials = await this.ctx.db
      .select({ m: t.boqItemMaterials, itemCode: t.items.code, itemName: t.items.name })
      .from(t.boqItemMaterials)
      .innerJoin(t.items, eq(t.items.id, t.boqItemMaterials.itemId))
      .where(eq(t.boqItemMaterials.boqItemId, id));
    return { ...item, materials: materials.map((x) => ({ ...x.m, itemCode: x.itemCode, itemName: x.itemName })) };
  }

  async saveBoqItem(projectId: string, id: string | null, dto: BoqItemDto) {
    const { materials, ...data } = dto;
    const amount = data.isSection ? '0' : m2(D(data.quantity).times(data.rate));
    const itemId = await this.ctx.db.transaction(async (tx) => {
      let bid = id;
      if (bid) {
        const [cur] = await tx.select().from(t.boqItems).where(eq(t.boqItems.id, bid));
        if (!cur || cur.projectId !== projectId) throw new NotFoundException();
        if (D(data.quantity).lessThan(D(cur.executedQty))) throw new BadRequestException(`Quantity cannot be below executed ${cur.executedQty}`);
        await tx.update(t.boqItems).set({ ...data, amount, quantity: q4(data.quantity), rate: m2(data.rate) }).where(eq(t.boqItems.id, bid));
        await tx.delete(t.boqItemMaterials).where(eq(t.boqItemMaterials.boqItemId, bid));
      } else {
        const [r] = await tx
          .insert(t.boqItems)
          .values({ ...data, projectId, amount, quantity: q4(data.quantity), rate: m2(data.rate) })
          .returning({ id: t.boqItems.id });
        bid = r.id;
      }
      if (materials.length) {
        await tx.insert(t.boqItemMaterials).values(materials.map((m) => ({ boqItemId: bid!, itemId: m.itemId, qtyPerUnit: q4(m.qtyPerUnit), wastagePercent: m.wastagePercent })));
      }
      return bid!;
    });
    await this.audit.log(id ? 'update' : 'create', 'boq_item', itemId, null, dto);
    return this.boqItem(itemId);
  }

  async deleteBoqItem(id: string) {
    const item = await this.boqItem(id);
    if (D(item.executedQty).greaterThan(0)) throw new BadRequestException('Item has been billed; cannot delete');
    await this.ctx.db.delete(t.boqItems).where(eq(t.boqItems.id, id));
    await this.audit.log('delete', 'boq_item', id, item, null);
    return { ok: true };
  }

  /** Estimated material need from BOQ rate analysis vs quantity already issued to the project. */
  async materialEstimate(projectId: string) {
    const db = this.ctx.db;
    const need = await db
      .select({
        itemId: t.items.id,
        itemCode: t.items.code,
        itemName: t.items.name,
        uom: t.uoms.code,
        estimated: sql<string>`sum(${t.boqItems.quantity} * ${t.boqItemMaterials.qtyPerUnit} * (1 + ${t.boqItemMaterials.wastagePercent} / 100))`,
      })
      .from(t.boqItemMaterials)
      .innerJoin(t.boqItems, eq(t.boqItems.id, t.boqItemMaterials.boqItemId))
      .innerJoin(t.items, eq(t.items.id, t.boqItemMaterials.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .where(eq(t.boqItems.projectId, projectId))
      .groupBy(t.items.id, t.items.code, t.items.name, t.uoms.code);
    const issued = await db
      .select({ itemId: t.stockMovements.itemId, qty: sql<string>`sum(-${t.stockMovements.quantity})`, value: sql<string>`sum(-${t.stockMovements.value})` })
      .from(t.stockMovements)
      .where(and(eq(t.stockMovements.projectId, projectId), eq(t.stockMovements.type, 'issue')))
      .groupBy(t.stockMovements.itemId);
    return need.map((n) => {
      const i = issued.find((x) => x.itemId === n.itemId);
      return { ...n, estimated: q4(n.estimated), issued: q4(i?.qty), issuedValue: m2(i?.value), balance: q4(D(n.estimated).minus(D(i?.qty))) };
    });
  }

  // ---------------- tasks (WBS) ----------------

  tasks(projectId: string) {
    return this.ctx.db
      .select({ task: t.projectTasks, assigneeFirst: t.employees.firstName, assigneeLast: t.employees.lastName })
      .from(t.projectTasks)
      .leftJoin(t.employees, eq(t.employees.id, t.projectTasks.assigneeId))
      .where(eq(t.projectTasks.projectId, projectId))
      .orderBy(asc(t.projectTasks.sortOrder), asc(t.projectTasks.code))
      .then((rows) => rows.map((r) => ({ ...r.task, assigneeName: r.assigneeFirst ? `${r.assigneeFirst} ${r.assigneeLast ?? ''}`.trim() : null })));
  }

  async saveTask(projectId: string, id: string | null, dto: ProjectTaskDto) {
    const status = D(dto.progress).equals(100) ? 'done' : dto.status === 'not_started' && D(dto.progress).greaterThan(0) ? 'in_progress' : dto.status;
    const values = { ...dto, status, projectId };
    const [row] = id
      ? await this.ctx.db.update(t.projectTasks).set(values).where(and(eq(t.projectTasks.id, id), eq(t.projectTasks.projectId, projectId))).returning()
      : await this.ctx.db.insert(t.projectTasks).values(values).returning();
    if (!row) throw new NotFoundException();
    await this.audit.log(id ? 'update' : 'create', 'project_task', row.id, null, dto);
    return row;
  }

  async deleteTask(projectId: string, id: string) {
    const [child] = await this.ctx.db.select({ id: t.projectTasks.id }).from(t.projectTasks).where(eq(t.projectTasks.parentId, id));
    if (child) throw new BadRequestException('Delete sub-tasks first');
    await this.ctx.db.delete(t.projectTasks).where(and(eq(t.projectTasks.id, id), eq(t.projectTasks.projectId, projectId)));
    await this.audit.log('delete', 'project_task', id);
    return { ok: true };
  }
}
