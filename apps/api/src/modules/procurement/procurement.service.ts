import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { GoodsReceiptDto, ListQuery, PurchaseOrderDto, PurchaseRequisitionDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PostingService, PostLine } from '../../ledger/posting.service';
import { StockService } from '../../ledger/stock.service';
import { D, Decimal, m2, pct, q4, sum } from '../../common/money';
import { searchClause } from '../../common/pagination';
import { itemAccounts } from '../inventory/inventory.service';
import { assertVendorApproved } from '../vendors/vendors.service';

@Injectable()
export class ProcurementService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
    private readonly stock: StockService,
  ) {}

  // ---------------- requisitions ----------------

  async listRequisitions(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.purchaseRequisitions.no, t.purchaseRequisitions.remarks]),
      q.status ? eq(t.purchaseRequisitions.status, q.status) : undefined,
      q.projectId ? eq(t.purchaseRequisitions.projectId, q.projectId) : undefined,
    );
    const data = await db
      .select({
        id: t.purchaseRequisitions.id,
        no: t.purchaseRequisitions.no,
        date: t.purchaseRequisitions.date,
        requiredBy: t.purchaseRequisitions.requiredBy,
        status: t.purchaseRequisitions.status,
        projectName: t.projects.name,
        remarks: t.purchaseRequisitions.remarks,
        lineCount: sql<number>`(select count(*)::int from ${t.purchaseRequisitionLines} where ${t.purchaseRequisitionLines.requisitionId} = ${t.purchaseRequisitions.id})`,
      })
      .from(t.purchaseRequisitions)
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseRequisitions.projectId))
      .where(where)
      .orderBy(desc(t.purchaseRequisitions.date), desc(t.purchaseRequisitions.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.purchaseRequisitions).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async getRequisition(id: string) {
    const db = this.ctx.db;
    const [pr] = await db.select().from(t.purchaseRequisitions).where(eq(t.purchaseRequisitions.id, id));
    if (!pr) throw new NotFoundException();
    const lines = await db
      .select({ line: t.purchaseRequisitionLines, itemCode: t.items.code, itemName: t.items.name, uom: t.uoms.code })
      .from(t.purchaseRequisitionLines)
      .innerJoin(t.items, eq(t.items.id, t.purchaseRequisitionLines.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .where(eq(t.purchaseRequisitionLines.requisitionId, id))
      .orderBy(asc(t.purchaseRequisitionLines.lineNo));
    const quotations = await this.quotations(id);
    return { ...pr, lines: lines.map((l) => ({ ...l.line, itemCode: l.itemCode, itemName: l.itemName, uom: l.uom })), quotations };
  }

  async createRequisitionIn(db: TenantDb, dto: PurchaseRequisitionDto, status = 'draft') {
    const no = await this.numbering.next(db, 'purchase_requisition', dto.date);
    const [pr] = await db
      .insert(t.purchaseRequisitions)
      .values({
        no,
        date: dto.date,
        requiredBy: dto.requiredBy,
        projectId: dto.projectId,
        warehouseId: dto.warehouseId,
        siteRequisitionId: dto.siteRequisitionId,
        requestedBy: this.ctx.userId,
        status,
        remarks: dto.remarks,
      })
      .returning({ id: t.purchaseRequisitions.id });
    await db.insert(t.purchaseRequisitionLines).values(
      dto.lines.map((l, i) => ({
        requisitionId: pr.id,
        lineNo: i + 1,
        itemId: l.itemId,
        quantity: q4(l.quantity),
        estimatedRate: l.estimatedRate != null ? m2(l.estimatedRate) : null,
        remarks: l.remarks,
      })),
    );
    return pr.id;
  }

  async createRequisition(dto: PurchaseRequisitionDto) {
    const id = await this.ctx.db.transaction((tx) => this.createRequisitionIn(tx, dto));
    await this.audit.log('create', 'purchase_requisition', id, null, dto);
    return this.getRequisition(id);
  }

  async setRequisitionStatus(id: string, to: 'submitted' | 'approved' | 'rejected') {
    const pr = await this.getRequisition(id);
    const allowed: Record<string, string[]> = { submitted: ['draft'], approved: ['submitted', 'draft'], rejected: ['submitted', 'draft'] };
    if (!allowed[to].includes(pr.status)) throw new BadRequestException(`Cannot ${to} a ${pr.status} requisition`);
    await this.ctx.db.update(t.purchaseRequisitions).set({ status: to }).where(eq(t.purchaseRequisitions.id, id));
    await this.audit.log(to === 'approved' ? 'approve' : to, 'purchase_requisition', id);
    return this.getRequisition(id);
  }

  // ---------------- quotations ----------------

  async quotations(requisitionId: string) {
    const db = this.ctx.db;
    const qs = await db
      .select({ q: t.supplierQuotations, partyName: t.parties.name })
      .from(t.supplierQuotations)
      .innerJoin(t.parties, eq(t.parties.id, t.supplierQuotations.partyId))
      .where(eq(t.supplierQuotations.requisitionId, requisitionId));
    if (!qs.length) return [];
    const lines = await db
      .select()
      .from(t.supplierQuotationLines)
      .where(inArray(t.supplierQuotationLines.quotationId, qs.map((x) => x.q.id)));
    return qs.map((x) => {
      const ls = lines.filter((l) => l.quotationId === x.q.id);
      return { ...x.q, partyName: x.partyName, lines: ls, total: m2(sum(ls.map((l) => D(l.quantity).times(l.unitPrice)))) };
    });
  }

  async addQuotation(dto: {
    requisitionId: string;
    partyId: string;
    quoteRef?: string | null;
    date: string;
    validUntil?: string | null;
    lines: { itemId: string; quantity: string; unitPrice: string; deliveryDays?: number | null }[];
  }) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const [q] = await tx
        .insert(t.supplierQuotations)
        .values({ requisitionId: dto.requisitionId, partyId: dto.partyId, quoteRef: dto.quoteRef, date: dto.date, validUntil: dto.validUntil })
        .returning({ id: t.supplierQuotations.id });
      await tx.insert(t.supplierQuotationLines).values(
        dto.lines.map((l) => ({ quotationId: q.id, itemId: l.itemId, quantity: q4(l.quantity), unitPrice: m2(l.unitPrice), deliveryDays: l.deliveryDays ?? null })),
      );
      return q.id;
    });
    await this.audit.log('create', 'supplier_quotation', id, null, dto);
    return this.quotations(dto.requisitionId);
  }

  // ---------------- purchase orders ----------------

  async listOrders(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.purchaseOrders.no, t.parties.name]),
      q.status ? eq(t.purchaseOrders.status, q.status) : undefined,
      q.partyId ? eq(t.purchaseOrders.partyId, q.partyId) : undefined,
      q.projectId ? eq(t.purchaseOrders.projectId, q.projectId) : undefined,
    );
    const data = await db
      .select({
        id: t.purchaseOrders.id,
        no: t.purchaseOrders.no,
        date: t.purchaseOrders.date,
        expectedDate: t.purchaseOrders.expectedDate,
        partyName: t.parties.name,
        projectName: t.projects.name,
        warehouse: t.warehouses.name,
        total: t.purchaseOrders.total,
        status: t.purchaseOrders.status,
      })
      .from(t.purchaseOrders)
      .innerJoin(t.parties, eq(t.parties.id, t.purchaseOrders.partyId))
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.purchaseOrders.warehouseId))
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .where(where)
      .orderBy(desc(t.purchaseOrders.date), desc(t.purchaseOrders.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.purchaseOrders)
      .innerJoin(t.parties, eq(t.parties.id, t.purchaseOrders.partyId))
      .where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async getOrder(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ po: t.purchaseOrders, partyName: t.parties.name, partyAddress: t.parties.address, warehouse: t.warehouses.name, projectName: t.projects.name })
      .from(t.purchaseOrders)
      .innerJoin(t.parties, eq(t.parties.id, t.purchaseOrders.partyId))
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.purchaseOrders.warehouseId))
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .where(eq(t.purchaseOrders.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db
      .select({ line: t.purchaseOrderLines, itemCode: t.items.code, itemName: t.items.name, uom: t.uoms.code })
      .from(t.purchaseOrderLines)
      .innerJoin(t.items, eq(t.items.id, t.purchaseOrderLines.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .where(eq(t.purchaseOrderLines.orderId, id))
      .orderBy(asc(t.purchaseOrderLines.lineNo));
    const receipts = await db
      .select({ id: t.goodsReceipts.id, no: t.goodsReceipts.no, date: t.goodsReceipts.date, status: t.goodsReceipts.status })
      .from(t.goodsReceipts)
      .where(eq(t.goodsReceipts.orderId, id));
    return {
      ...row.po,
      partyName: row.partyName,
      partyAddress: row.partyAddress,
      warehouse: row.warehouse,
      projectName: row.projectName,
      lines: lines.map((l) => ({ ...l.line, itemCode: l.itemCode, itemName: l.itemName, uom: l.uom, pendingQty: q4(D(l.line.quantity).minus(l.line.receivedQty)) })),
      receipts,
    };
  }

  async createOrder(dto: PurchaseOrderDto) {
    const id = await this.ctx.db.transaction(async (tx) => {
      await assertVendorApproved(tx, dto.partyId);
      const vat = await tx.select({ id: t.taxCodes.id, rate: t.taxCodes.rate }).from(t.taxCodes).where(eq(t.taxCodes.kind, 'vat'));
      const rate = new Map(vat.map((v) => [v.id, v.rate]));
      const lines = dto.lines.map((l, i) => {
        const amount = D(l.quantity).times(l.unitPrice).toDecimalPlaces(2);
        const v = l.vatCodeId ? pct(amount, rate.get(l.vatCodeId) ?? 0) : new Decimal(0);
        return { ...l, lineNo: i + 1, amount, vat: v };
      });
      const subtotal = sum(lines.map((l) => l.amount));
      const vatTotal = sum(lines.map((l) => l.vat));
      const no = await this.numbering.next(tx, 'purchase_order', dto.date);
      const [po] = await tx
        .insert(t.purchaseOrders)
        .values({
          no,
          partyId: dto.partyId,
          date: dto.date,
          expectedDate: dto.expectedDate,
          projectId: dto.projectId,
          warehouseId: dto.warehouseId,
          requisitionId: dto.requisitionId,
          subtotal: m2(subtotal),
          vatAmount: m2(vatTotal),
          total: m2(subtotal.plus(vatTotal)),
          terms: dto.terms,
          createdBy: this.ctx.userId,
        })
        .returning({ id: t.purchaseOrders.id });
      await tx.insert(t.purchaseOrderLines).values(
        lines.map((l) => ({
          orderId: po.id,
          lineNo: l.lineNo,
          itemId: l.itemId,
          description: l.description,
          quantity: q4(l.quantity),
          unitPrice: m2(l.unitPrice),
          vatCodeId: l.vatCodeId,
          vatAmount: m2(l.vat),
          amount: m2(l.amount),
        })),
      );
      if (dto.requisitionId) {
        await tx.update(t.purchaseRequisitions).set({ status: 'ordered' }).where(eq(t.purchaseRequisitions.id, dto.requisitionId));
      }
      return po.id;
    });
    await this.audit.log('create', 'purchase_order', id, null, dto);
    return this.getOrder(id);
  }

  async setOrderStatus(id: string, to: 'approved' | 'cancelled' | 'closed') {
    const po = await this.getOrder(id);
    const allowed: Record<string, string[]> = {
      approved: ['draft'],
      cancelled: ['draft', 'approved'],
      closed: ['partially_received', 'received', 'approved'],
    };
    if (!allowed[to].includes(po.status)) throw new BadRequestException(`Cannot mark a ${po.status} order as ${to}`);
    if (to === 'approved') await assertVendorApproved(this.ctx.db, po.partyId);
    if (to === 'cancelled' && po.lines.some((l) => D(l.receivedQty).greaterThan(0))) {
      throw new BadRequestException('Goods already received; close the order instead');
    }
    await this.ctx.db
      .update(t.purchaseOrders)
      .set({ status: to, ...(to === 'approved' ? { approvedBy: this.ctx.userId } : {}) })
      .where(eq(t.purchaseOrders.id, id));
    await this.audit.log(to === 'approved' ? 'approve' : to, 'purchase_order', id);
    return this.getOrder(id);
  }

  // ---------------- goods receipts ----------------

  async listReceipts(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(searchClause(q, [t.goodsReceipts.no, t.goodsReceipts.challanNo, t.parties.name]), q.status ? eq(t.goodsReceipts.status, q.status) : undefined);
    const data = await db
      .select({
        id: t.goodsReceipts.id,
        no: t.goodsReceipts.no,
        date: t.goodsReceipts.date,
        challanNo: t.goodsReceipts.challanNo,
        status: t.goodsReceipts.status,
        partyName: t.parties.name,
        orderNo: t.purchaseOrders.no,
        warehouse: t.warehouses.name,
        billed: sql<boolean>`exists(select 1 from ${t.bills} where ${t.bills.goodsReceiptId} = ${t.goodsReceipts.id} and ${t.bills.status} <> 'cancelled')`,
      })
      .from(t.goodsReceipts)
      .innerJoin(t.parties, eq(t.parties.id, t.goodsReceipts.partyId))
      .innerJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.goodsReceipts.orderId))
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.goodsReceipts.warehouseId))
      .where(where)
      .orderBy(desc(t.goodsReceipts.date), desc(t.goodsReceipts.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.goodsReceipts)
      .innerJoin(t.parties, eq(t.parties.id, t.goodsReceipts.partyId))
      .where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async getReceipt(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ grn: t.goodsReceipts, partyName: t.parties.name, orderNo: t.purchaseOrders.no, warehouse: t.warehouses.name })
      .from(t.goodsReceipts)
      .innerJoin(t.parties, eq(t.parties.id, t.goodsReceipts.partyId))
      .innerJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.goodsReceipts.orderId))
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.goodsReceipts.warehouseId))
      .where(eq(t.goodsReceipts.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db
      .select({ line: t.goodsReceiptLines, itemCode: t.items.code, itemName: t.items.name, uom: t.uoms.code })
      .from(t.goodsReceiptLines)
      .innerJoin(t.items, eq(t.items.id, t.goodsReceiptLines.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .where(eq(t.goodsReceiptLines.receiptId, id));
    return { ...row.grn, partyName: row.partyName, orderNo: row.orderNo, warehouse: row.warehouse, lines: lines.map((l) => ({ ...l.line, itemCode: l.itemCode, itemName: l.itemName, uom: l.uom })) };
  }

  /**
   * Receives goods against an approved PO and posts immediately:
   * stock items → stock receipt at PO price, Dr Inventory / Cr GRNI;
   * non-stock & service items → Dr expense (project cost) / Cr GRNI.
   */
  async receive(dto: GoodsReceiptDto) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const [po] = await tx.select().from(t.purchaseOrders).where(eq(t.purchaseOrders.id, dto.orderId)).for('update');
      if (!po) throw new NotFoundException('Purchase order not found');
      if (!['approved', 'partially_received'].includes(po.status)) throw new BadRequestException(`PO is ${po.status}; it must be approved`);
      const poLines = await tx.select().from(t.purchaseOrderLines).where(eq(t.purchaseOrderLines.orderId, po.id));
      const items = await tx.select({ id: t.items.id, type: t.items.type }).from(t.items).where(inArray(t.items.id, poLines.map((l) => l.itemId)));
      const itemType = new Map(items.map((i) => [i.id, i.type]));
      const warehouseId = dto.warehouseId ?? po.warehouseId;

      const no = await this.numbering.next(tx, 'goods_receipt', dto.date);
      const [grn] = await tx
        .insert(t.goodsReceipts)
        .values({ no, orderId: po.id, partyId: po.partyId, date: dto.date, warehouseId, challanNo: dto.challanNo, remarks: dto.remarks, createdBy: this.ctx.userId })
        .returning({ id: t.goodsReceipts.id });

      const accts = await itemAccounts(tx, poLines.map((l) => l.itemId));
      const gl: PostLine[] = [];
      for (const r of dto.lines) {
        const pol = poLines.find((l) => l.id === r.orderLineId);
        if (!pol) throw new BadRequestException('Line does not belong to this PO');
        const pending = D(pol.quantity).minus(pol.receivedQty);
        if (D(r.quantity).greaterThan(pending)) throw new BadRequestException(`Receiving ${r.quantity} but only ${pending.toFixed(4)} pending on line ${pol.lineNo}`);
        const amount = D(r.quantity).times(pol.unitPrice).toDecimalPlaces(2);
        await tx.insert(t.goodsReceiptLines).values({ receiptId: grn.id, orderLineId: pol.id, itemId: pol.itemId, quantity: q4(r.quantity), unitCost: m2(pol.unitPrice), amount: m2(amount) });
        await tx.update(t.purchaseOrderLines).set({ receivedQty: sql`${t.purchaseOrderLines.receivedQty} + ${q4(r.quantity)}` }).where(eq(t.purchaseOrderLines.id, pol.id));

        const a = accts.get(pol.itemId)!;
        if (itemType.get(pol.itemId) === 'stock') {
          await this.stock.move(tx, { date: dto.date, type: 'receipt', itemId: pol.itemId, warehouseId, quantity: r.quantity, unitCost: pol.unitPrice, sourceType: 'grn', sourceId: grn.id, projectId: po.projectId });
          gl.push({ account: a.inventory, debit: amount, description: `GRN ${no}` });
        } else {
          gl.push({ account: a.expense, debit: amount, projectId: po.projectId, description: `GRN ${no}` });
        }
        gl.push({ account: 'grni', credit: amount, partyId: po.partyId });
      }

      const entryId = await this.posting.post(tx, { date: dto.date, sourceType: 'grn', sourceId: grn.id, reference: dto.challanNo ?? no, narration: `Goods received ${no} against ${po.no}`, lines: gl });
      await tx.update(t.goodsReceipts).set({ status: 'posted', journalEntryId: entryId }).where(eq(t.goodsReceipts.id, grn.id));

      const updated = await tx.select().from(t.purchaseOrderLines).where(eq(t.purchaseOrderLines.orderId, po.id));
      const full = updated.every((l) => D(l.receivedQty).greaterThanOrEqualTo(D(l.quantity)));
      await tx.update(t.purchaseOrders).set({ status: full ? 'received' : 'partially_received' }).where(eq(t.purchaseOrders.id, po.id));
      return grn.id;
    });
    await this.audit.log('post', 'goods_receipt', id, null, dto);
    return this.getReceipt(id);
  }
}
