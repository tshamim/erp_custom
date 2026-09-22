import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { ItemDto, ListQuery, StockDocumentDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PostingService, PostLine } from '../../ledger/posting.service';
import { StockService } from '../../ledger/stock.service';
import { D, q4, r6 } from '../../common/money';
import { searchClause } from '../../common/pagination';

/** Item → inventory / expense GL account (category override, else posting-role key). */
export async function itemAccounts(db: TenantDb, itemIds: string[]) {
  const map = new Map<string, { inventory: PostLine['account']; expense: PostLine['account'] }>();
  if (!itemIds.length) return map;
  const rows = await db
    .select({ id: t.items.id, inv: t.itemCategories.inventoryAccountId, exp: t.itemCategories.expenseAccountId })
    .from(t.items)
    .leftJoin(t.itemCategories, eq(t.itemCategories.id, t.items.categoryId))
    .where(inArray(t.items.id, itemIds));
  for (const r of rows) {
    map.set(r.id, {
      inventory: r.inv ? { id: r.inv } : 'inventory',
      expense: r.exp ? { id: r.exp } : 'material_cost',
    });
  }
  return map;
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListQuery & { categoryId?: string; lowStock?: boolean }) {
    const db = this.ctx.db;
    const onHand = sql<string>`coalesce((select sum(${t.stockBalances.quantity}) from ${t.stockBalances} where ${t.stockBalances.itemId} = ${t.items.id}), 0)`;
    const value = sql<string>`coalesce((select sum(${t.stockBalances.value}) from ${t.stockBalances} where ${t.stockBalances.itemId} = ${t.items.id}), 0)`;
    const where = and(
      searchClause(q, [t.items.code, t.items.name, t.items.specification]),
      q.categoryId ? eq(t.items.categoryId, q.categoryId) : undefined,
      q.type ? eq(t.items.type, q.type) : undefined,
      q.lowStock ? sql`${onHand} <= ${t.items.reorderLevel} and ${t.items.reorderLevel} > 0` : undefined,
    );
    const data = await db
      .select({
        id: t.items.id,
        code: t.items.code,
        name: t.items.name,
        specification: t.items.specification,
        type: t.items.type,
        categoryName: t.itemCategories.name,
        uom: t.uoms.code,
        reorderLevel: t.items.reorderLevel,
        standardCost: t.items.standardCost,
        isActive: t.items.isActive,
        onHand,
        value,
      })
      .from(t.items)
      .leftJoin(t.itemCategories, eq(t.itemCategories.id, t.items.categoryId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .where(where)
      .orderBy(asc(t.items.code))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.items)
      .where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [item] = await db.select().from(t.items).where(eq(t.items.id, id));
    if (!item) throw new NotFoundException();
    const stock = await db
      .select({
        warehouseId: t.warehouses.id,
        warehouse: t.warehouses.name,
        quantity: t.stockBalances.quantity,
        avgCost: t.stockBalances.avgCost,
        value: t.stockBalances.value,
      })
      .from(t.stockBalances)
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.stockBalances.warehouseId))
      .where(eq(t.stockBalances.itemId, id));
    return { ...item, stock };
  }

  async create(dto: ItemDto) {
    const [row] = await this.ctx.db.insert(t.items).values(dto).returning();
    await this.audit.log('create', 'item', row.id, null, row);
    return row;
  }

  async update(id: string, dto: Partial<ItemDto>) {
    const [before] = await this.ctx.db.select().from(t.items).where(eq(t.items.id, id));
    if (!before) throw new NotFoundException();
    const [row] = await this.ctx.db.update(t.items).set(dto).where(eq(t.items.id, id)).returning();
    await this.audit.log('update', 'item', id, before, row);
    return row;
  }

  pick() {
    return this.ctx.db
      .select({ id: t.items.id, code: t.items.code, name: t.items.name, uom: t.uoms.code, standardCost: t.items.standardCost, defaultVatCodeId: t.items.defaultVatCodeId })
      .from(t.items)
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .where(eq(t.items.isActive, true))
      .orderBy(asc(t.items.code));
  }
}

@Injectable()
export class StockDocumentsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
    private readonly stock: StockService,
  ) {}

  balances(q: { warehouseId?: string; itemId?: string; search?: string }) {
    return this.ctx.db
      .select({
        itemId: t.items.id,
        itemCode: t.items.code,
        itemName: t.items.name,
        uom: t.uoms.code,
        warehouseId: t.warehouses.id,
        warehouse: t.warehouses.name,
        quantity: t.stockBalances.quantity,
        avgCost: t.stockBalances.avgCost,
        value: t.stockBalances.value,
        reorderLevel: t.items.reorderLevel,
      })
      .from(t.stockBalances)
      .innerJoin(t.items, eq(t.items.id, t.stockBalances.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.stockBalances.warehouseId))
      .where(
        and(
          sql`${t.stockBalances.quantity} <> 0`,
          q.warehouseId ? eq(t.stockBalances.warehouseId, q.warehouseId) : undefined,
          q.itemId ? eq(t.stockBalances.itemId, q.itemId) : undefined,
          searchClause({ search: q.search } as ListQuery, [t.items.code, t.items.name]),
        ),
      )
      .orderBy(asc(t.items.code), asc(t.warehouses.name));
  }

  ledger(q: { itemId?: string; warehouseId?: string; projectId?: string; from?: string; to?: string }) {
    return this.ctx.db
      .select({
        id: t.stockMovements.id,
        date: t.stockMovements.date,
        type: t.stockMovements.type,
        itemCode: t.items.code,
        itemName: t.items.name,
        warehouse: t.warehouses.name,
        quantity: t.stockMovements.quantity,
        unitCost: t.stockMovements.unitCost,
        value: t.stockMovements.value,
        balanceQty: t.stockMovements.balanceQty,
        balanceValue: t.stockMovements.balanceValue,
        sourceType: t.stockMovements.sourceType,
        sourceId: t.stockMovements.sourceId,
        projectName: t.projects.name,
      })
      .from(t.stockMovements)
      .innerJoin(t.items, eq(t.items.id, t.stockMovements.itemId))
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.stockMovements.warehouseId))
      .leftJoin(t.projects, eq(t.projects.id, t.stockMovements.projectId))
      .where(
        and(
          q.itemId ? eq(t.stockMovements.itemId, q.itemId) : undefined,
          q.warehouseId ? eq(t.stockMovements.warehouseId, q.warehouseId) : undefined,
          q.projectId ? eq(t.stockMovements.projectId, q.projectId) : undefined,
          q.from ? gte(t.stockMovements.date, q.from) : undefined,
          q.to ? lte(t.stockMovements.date, q.to) : undefined,
        ),
      )
      .orderBy(asc(t.stockMovements.date), asc(t.stockMovements.createdAt))
      .limit(1000);
  }

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.stockDocuments.no, t.stockDocuments.remarks]),
      q.type ? eq(t.stockDocuments.type, q.type) : undefined,
      q.status ? eq(t.stockDocuments.status, q.status) : undefined,
      q.projectId ? eq(t.stockDocuments.projectId, q.projectId) : undefined,
    );
    const data = await db
      .select({
        id: t.stockDocuments.id,
        no: t.stockDocuments.no,
        type: t.stockDocuments.type,
        date: t.stockDocuments.date,
        status: t.stockDocuments.status,
        projectName: t.projects.name,
        remarks: t.stockDocuments.remarks,
      })
      .from(t.stockDocuments)
      .leftJoin(t.projects, eq(t.projects.id, t.stockDocuments.projectId))
      .where(where)
      .orderBy(desc(t.stockDocuments.date), desc(t.stockDocuments.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.stockDocuments).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [doc] = await db.select().from(t.stockDocuments).where(eq(t.stockDocuments.id, id));
    if (!doc) throw new NotFoundException();
    const lines = await db
      .select({ line: t.stockDocumentLines, itemCode: t.items.code, itemName: t.items.name, uom: t.uoms.code })
      .from(t.stockDocumentLines)
      .innerJoin(t.items, eq(t.items.id, t.stockDocumentLines.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .where(eq(t.stockDocumentLines.documentId, id))
      .orderBy(asc(t.stockDocumentLines.lineNo));
    return { ...doc, lines: lines.map((l) => ({ ...l.line, itemCode: l.itemCode, itemName: l.itemName, uom: l.uom })) };
  }

  private validate(dto: StockDocumentDto) {
    const need = (cond: unknown, msg: string) => {
      if (!cond) throw new BadRequestException(msg);
    };
    switch (dto.type) {
      case 'issue':
        need(dto.fromWarehouseId, 'Source warehouse is required');
        need(dto.projectId, 'Project is required for material issue');
        break;
      case 'transfer':
        need(dto.fromWarehouseId && dto.toWarehouseId, 'Source and destination warehouses are required');
        need(dto.fromWarehouseId !== dto.toWarehouseId, 'Source and destination must differ');
        break;
      case 'adjustment':
        need(dto.fromWarehouseId, 'Warehouse is required');
        break;
      case 'opening':
        need(dto.toWarehouseId, 'Warehouse is required');
        need(dto.lines.every((l) => l.unitCost != null && D(l.quantity).isPositive()), 'Opening stock needs positive quantity and unit cost');
        break;
    }
    if (dto.type !== 'adjustment' && dto.lines.some((l) => !D(l.quantity).isPositive())) {
      throw new BadRequestException('Quantities must be positive');
    }
  }

  async createIn(db: TenantDb, dto: StockDocumentDto) {
    this.validate(dto);
    const no = await this.numbering.next(db, `stock_${dto.type}`, dto.date);
    const [doc] = await db
      .insert(t.stockDocuments)
      .values({
        no,
        type: dto.type,
        date: dto.date,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        projectId: dto.projectId,
        siteRequisitionId: dto.siteRequisitionId,
        remarks: dto.remarks,
        createdBy: this.ctx.userId,
      })
      .returning({ id: t.stockDocuments.id });
    await db.insert(t.stockDocumentLines).values(
      dto.lines.map((l, i) => ({
        documentId: doc.id,
        lineNo: i + 1,
        itemId: l.itemId,
        quantity: q4(l.quantity),
        unitCost: l.unitCost != null ? r6(l.unitCost) : null,
        boqItemId: l.boqItemId,
        remarks: l.remarks,
      })),
    );
    return doc.id;
  }

  async postIn(db: TenantDb, id: string) {
    const [doc] = await db.select().from(t.stockDocuments).where(eq(t.stockDocuments.id, id)).for('update');
    if (!doc) throw new NotFoundException();
    if (doc.status !== 'draft') throw new BadRequestException(`Document is ${doc.status}`);
    const lines = await db.select().from(t.stockDocumentLines).where(eq(t.stockDocumentLines.documentId, id));
    const accts = await itemAccounts(db, lines.map((l) => l.itemId));
    const base = { date: doc.date, sourceType: 'stock_doc', sourceId: doc.id, projectId: doc.projectId };
    const gl: PostLine[] = [];

    for (const l of lines) {
      const a = accts.get(l.itemId)!;
      if (doc.type === 'issue') {
        const value = await this.stock.move(db, { ...base, type: 'issue', itemId: l.itemId, warehouseId: doc.fromWarehouseId!, quantity: l.quantity, boqItemId: l.boqItemId });
        gl.push({ account: a.expense, debit: value, projectId: doc.projectId }, { account: a.inventory, credit: value });
        if (doc.siteRequisitionId) {
          await db
            .update(t.siteRequisitionLines)
            .set({ issuedQty: sql`${t.siteRequisitionLines.issuedQty} + ${l.quantity}` })
            .where(and(eq(t.siteRequisitionLines.requisitionId, doc.siteRequisitionId), eq(t.siteRequisitionLines.itemId, l.itemId)));
        }
      } else if (doc.type === 'transfer') {
        const value = await this.stock.move(db, { ...base, type: 'transfer_out', itemId: l.itemId, warehouseId: doc.fromWarehouseId!, quantity: l.quantity });
        const unit = value.dividedBy(D(l.quantity));
        await this.stock.move(db, { ...base, type: 'transfer_in', itemId: l.itemId, warehouseId: doc.toWarehouseId!, quantity: l.quantity, unitCost: unit.toString() });
      } else if (doc.type === 'adjustment') {
        const value = await this.stock.move(db, { ...base, type: 'adjustment', itemId: l.itemId, warehouseId: doc.fromWarehouseId!, quantity: l.quantity, unitCost: l.unitCost });
        if (D(l.quantity).isPositive()) gl.push({ account: a.inventory, debit: value }, { account: 'stock_adjustment', credit: value });
        else gl.push({ account: 'stock_adjustment', debit: value }, { account: a.inventory, credit: value });
      } else if (doc.type === 'opening') {
        const value = await this.stock.move(db, { ...base, type: 'opening', itemId: l.itemId, warehouseId: doc.toWarehouseId!, quantity: l.quantity, unitCost: l.unitCost });
        gl.push({ account: a.inventory, debit: value }, { account: 'retained_earnings', credit: value });
      }
    }

    let journalEntryId: string | null = null;
    if (gl.some((l) => !D(l.debit).isZero() || !D(l.credit).isZero())) {
      journalEntryId = await this.posting.post(db, {
        date: doc.date,
        sourceType: 'stock',
        sourceId: doc.id,
        reference: doc.no,
        narration: `Stock ${doc.type} ${doc.no}`,
        lines: gl,
      });
    }
    await db.update(t.stockDocuments).set({ status: 'posted', journalEntryId }).where(eq(t.stockDocuments.id, id));

    if (doc.siteRequisitionId) {
      const reqLines = await db.select().from(t.siteRequisitionLines).where(eq(t.siteRequisitionLines.requisitionId, doc.siteRequisitionId));
      const full = reqLines.every((r) => D(r.issuedQty).greaterThanOrEqualTo(D(r.quantity)));
      await db
        .update(t.siteRequisitions)
        .set({ status: full ? 'fulfilled' : 'partially_fulfilled' })
        .where(eq(t.siteRequisitions.id, doc.siteRequisitionId));
    }
  }

  async create(dto: StockDocumentDto, post: boolean) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const id = await this.createIn(tx, dto);
      if (post) await this.postIn(tx, id);
      return id;
    });
    await this.audit.log(post ? 'post' : 'create', 'stock_document', id, null, dto);
    return this.get(id);
  }

  async post(id: string) {
    await this.ctx.db.transaction((tx) => this.postIn(tx, id));
    await this.audit.log('post', 'stock_document', id);
    return this.get(id);
  }

  async remove(id: string) {
    const doc = await this.get(id);
    if (doc.status !== 'draft') throw new BadRequestException('Only drafts can be deleted');
    await this.ctx.db.delete(t.stockDocuments).where(eq(t.stockDocuments.id, id));
    await this.audit.log('delete', 'stock_document', id, doc, null);
    return { ok: true };
  }
}
