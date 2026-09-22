import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import type { DprDto, ListQuery, RaBillDto, SiteRequisitionDto, SubcontractBillDto, WorkOrderDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { D, Decimal, m2, pct, q4, sum } from '../../common/money';
import { searchClause } from '../../common/pagination';
import { InvoicesService, BillsService } from '../finance/documents.service';
import { ProcurementService } from '../procurement/procurement.service';
import { PostingService } from '../../ledger/posting.service';

export interface RaInput {
  lines: { rate: string; previousQty: string; currentQty: string; quantity: string }[];
  retentionPercent: string;
  vatPercent: string;
  advanceRecoveryPercent: string;
  advanceOutstanding: string;
}

/**
 * RA bill arithmetic. Pure.
 * gross = Σ currentQty × rate; retention & advance recovery are % of gross (recovery capped at outstanding advance);
 * VAT on gross; net receivable = gross + VAT − retention − recovery.
 */
export function computeRaBill(i: RaInput) {
  for (const l of i.lines) {
    if (D(l.previousQty).plus(l.currentQty).greaterThan(D(l.quantity))) {
      throw new BadRequestException(`Cumulative quantity exceeds BOQ quantity (${l.quantity})`);
    }
  }
  const amounts = i.lines.map((l) => D(l.currentQty).times(l.rate).toDecimalPlaces(2));
  const gross = sum(amounts);
  const retention = pct(gross, i.retentionPercent);
  const recovery = Decimal.min(pct(gross, i.advanceRecoveryPercent), Decimal.max(D(i.advanceOutstanding), 0));
  const vat = pct(gross, i.vatPercent);
  return { amounts, gross, retention, recovery, vat, net: gross.plus(vat).minus(retention).minus(recovery) };
}

@Injectable()
export class SiteService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly invoices: InvoicesService,
    private readonly bills: BillsService,
    private readonly procurement: ProcurementService,
    private readonly posting: PostingService,
  ) {}

  // ---------------- site requisitions ----------------

  async listRequisitions(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.siteRequisitions.no, t.siteRequisitions.remarks]),
      q.status ? eq(t.siteRequisitions.status, q.status) : undefined,
      q.projectId ? eq(t.siteRequisitions.projectId, q.projectId) : undefined,
    );
    const data = await db
      .select({
        id: t.siteRequisitions.id,
        no: t.siteRequisitions.no,
        date: t.siteRequisitions.date,
        requiredBy: t.siteRequisitions.requiredBy,
        status: t.siteRequisitions.status,
        projectId: t.siteRequisitions.projectId,
        projectName: t.projects.name,
        remarks: t.siteRequisitions.remarks,
      })
      .from(t.siteRequisitions)
      .innerJoin(t.projects, eq(t.projects.id, t.siteRequisitions.projectId))
      .where(where)
      .orderBy(desc(t.siteRequisitions.date), desc(t.siteRequisitions.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.siteRequisitions).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async getRequisition(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ r: t.siteRequisitions, projectName: t.projects.name })
      .from(t.siteRequisitions)
      .innerJoin(t.projects, eq(t.projects.id, t.siteRequisitions.projectId))
      .where(eq(t.siteRequisitions.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db
      .select({ line: t.siteRequisitionLines, itemCode: t.items.code, itemName: t.items.name, uom: t.uoms.code, boqCode: t.boqItems.code })
      .from(t.siteRequisitionLines)
      .innerJoin(t.items, eq(t.items.id, t.siteRequisitionLines.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .leftJoin(t.boqItems, eq(t.boqItems.id, t.siteRequisitionLines.boqItemId))
      .where(eq(t.siteRequisitionLines.requisitionId, id))
      .orderBy(asc(t.siteRequisitionLines.lineNo));
    return {
      ...row.r,
      projectName: row.projectName,
      lines: lines.map((l) => ({ ...l.line, itemCode: l.itemCode, itemName: l.itemName, uom: l.uom, boqCode: l.boqCode, pendingQty: q4(D(l.line.quantity).minus(l.line.issuedQty)) })),
    };
  }

  async createRequisition(dto: SiteRequisitionDto) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const no = await this.numbering.next(tx, 'site_requisition', dto.date);
      const [r] = await tx
        .insert(t.siteRequisitions)
        .values({ no, projectId: dto.projectId, date: dto.date, requiredBy: dto.requiredBy, remarks: dto.remarks, requestedBy: this.ctx.userId })
        .returning({ id: t.siteRequisitions.id });
      await tx.insert(t.siteRequisitionLines).values(
        dto.lines.map((l, i) => ({ requisitionId: r.id, lineNo: i + 1, itemId: l.itemId, quantity: q4(l.quantity), boqItemId: l.boqItemId, remarks: l.remarks })),
      );
      return r.id;
    });
    await this.audit.log('create', 'site_requisition', id, null, dto);
    return this.getRequisition(id);
  }

  async setRequisitionStatus(id: string, to: 'submitted' | 'approved' | 'rejected') {
    const r = await this.getRequisition(id);
    const allowed: Record<string, string[]> = { submitted: ['draft'], approved: ['submitted', 'draft'], rejected: ['submitted', 'draft'] };
    if (!allowed[to].includes(r.status)) throw new BadRequestException(`Cannot ${to} a ${r.status} requisition`);
    await this.ctx.db.update(t.siteRequisitions).set({ status: to }).where(eq(t.siteRequisitions.id, id));
    await this.audit.log(to === 'approved' ? 'approve' : to, 'site_requisition', id);
    return this.getRequisition(id);
  }

  /** Raises a purchase requisition for the still-pending quantities of an approved site requisition. */
  async toPurchaseRequisition(id: string) {
    const r = await this.getRequisition(id);
    if (!['approved', 'partially_fulfilled'].includes(r.status)) throw new BadRequestException('Requisition must be approved');
    const pending = r.lines.filter((l) => D(l.pendingQty).greaterThan(0));
    if (!pending.length) throw new BadRequestException('Nothing pending');
    const [siteStore] = await this.ctx.db.select().from(t.warehouses).where(eq(t.warehouses.projectId, r.projectId));
    return this.procurement.createRequisition({
      date: new Date().toISOString().slice(0, 10),
      requiredBy: r.requiredBy,
      projectId: r.projectId,
      warehouseId: siteStore?.id ?? null,
      siteRequisitionId: r.id,
      remarks: `From site requisition ${r.no}`,
      lines: pending.map((l) => ({ itemId: l.itemId, quantity: l.pendingQty, estimatedRate: null, remarks: null })),
    });
  }

  // ---------------- work orders & subcontract bills ----------------

  async listWorkOrders(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.workOrders.no, t.parties.name]),
      q.projectId ? eq(t.workOrders.projectId, q.projectId) : undefined,
      q.status ? eq(t.workOrders.status, q.status) : undefined,
    );
    const data = await db
      .select({
        id: t.workOrders.id,
        no: t.workOrders.no,
        date: t.workOrders.date,
        partyName: t.parties.name,
        projectName: t.projects.name,
        value: t.workOrders.value,
        status: t.workOrders.status,
        billed: sql<string>`coalesce((select sum(${t.subcontractBills.grossAmount}) from ${t.subcontractBills} where ${t.subcontractBills.workOrderId} = ${t.workOrders.id} and ${t.subcontractBills.status} = 'approved'), 0)`,
      })
      .from(t.workOrders)
      .innerJoin(t.parties, eq(t.parties.id, t.workOrders.partyId))
      .innerJoin(t.projects, eq(t.projects.id, t.workOrders.projectId))
      .where(where)
      .orderBy(desc(t.workOrders.date))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.workOrders)
      .innerJoin(t.parties, eq(t.parties.id, t.workOrders.partyId))
      .where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async getWorkOrder(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ wo: t.workOrders, partyName: t.parties.name, projectName: t.projects.name })
      .from(t.workOrders)
      .innerJoin(t.parties, eq(t.parties.id, t.workOrders.partyId))
      .innerJoin(t.projects, eq(t.projects.id, t.workOrders.projectId))
      .where(eq(t.workOrders.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db.select().from(t.workOrderLines).where(eq(t.workOrderLines.workOrderId, id)).orderBy(asc(t.workOrderLines.lineNo));
    const bills = await db.select().from(t.subcontractBills).where(eq(t.subcontractBills.workOrderId, id)).orderBy(asc(t.subcontractBills.date));
    return { ...row.wo, partyName: row.partyName, projectName: row.projectName, lines, bills };
  }

  async createWorkOrder(dto: WorkOrderDto) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const [party] = await tx.select().from(t.parties).where(eq(t.parties.id, dto.partyId));
      if (party?.type !== 'subcontractor') throw new BadRequestException('Party must be a subcontractor');
      const lines = dto.lines.map((l, i) => ({ ...l, lineNo: i + 1, amount: D(l.quantity).times(l.rate).toDecimalPlaces(2) }));
      const no = await this.numbering.next(tx, 'work_order', dto.date);
      const [wo] = await tx
        .insert(t.workOrders)
        .values({ no, projectId: dto.projectId, partyId: dto.partyId, date: dto.date, scope: dto.scope, retentionPercent: dto.retentionPercent, value: m2(sum(lines.map((l) => l.amount))), status: 'active' })
        .returning({ id: t.workOrders.id });
      await tx.insert(t.workOrderLines).values(
        lines.map((l) => ({ workOrderId: wo.id, lineNo: l.lineNo, boqItemId: l.boqItemId, description: l.description, uom: l.uom, quantity: q4(l.quantity), rate: m2(l.rate), amount: m2(l.amount) })),
      );
      return wo.id;
    });
    await this.audit.log('create', 'work_order', id, null, dto);
    return this.getWorkOrder(id);
  }

  /** Measures work done by the subcontractor, then books an AP bill (with retention) against the project. */
  async createSubcontractBill(dto: SubcontractBillDto) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const [wo] = await tx.select().from(t.workOrders).where(eq(t.workOrders.id, dto.workOrderId)).for('update');
      if (!wo) throw new NotFoundException('Work order not found');
      if (wo.status !== 'active') throw new BadRequestException(`Work order is ${wo.status}`);
      const woLines = await tx.select().from(t.workOrderLines).where(eq(t.workOrderLines.workOrderId, wo.id));
      const measured = dto.lines.map((l) => {
        const wl = woLines.find((x) => x.id === l.workOrderLineId);
        if (!wl) throw new BadRequestException('Line does not belong to this work order');
        if (D(wl.executedQty).plus(l.currentQty).greaterThan(D(wl.quantity))) {
          throw new BadRequestException(`"${wl.description}": cumulative quantity exceeds work order quantity ${wl.quantity}`);
        }
        return { wl, current: D(l.currentQty), amount: D(l.currentQty).times(wl.rate).toDecimalPlaces(2) };
      });
      const gross = sum(measured.map((m) => m.amount));
      const retention = pct(gross, wo.retentionPercent);
      const no = await this.numbering.next(tx, 'subcontract_bill', dto.date);
      const [sb] = await tx
        .insert(t.subcontractBills)
        .values({ no, workOrderId: wo.id, date: dto.date, periodFrom: dto.periodFrom, periodTo: dto.periodTo, grossAmount: m2(gross), retentionAmount: m2(retention), netAmount: m2(gross.minus(retention)), status: 'approved' })
        .returning({ id: t.subcontractBills.id });
      await tx.insert(t.subcontractBillLines).values(
        measured.map((m) => ({ subcontractBillId: sb.id, workOrderLineId: m.wl.id, previousQty: m.wl.executedQty, currentQty: q4(m.current), rate: m.wl.rate, amount: m2(m.amount) })),
      );
      for (const m of measured) {
        await tx.update(t.workOrderLines).set({ executedQty: sql`${t.workOrderLines.executedQty} + ${q4(m.current)}` }).where(eq(t.workOrderLines.id, m.wl.id));
      }
      const billId = await this.bills.createIn(
        tx,
        {
          partyId: wo.partyId,
          vendorRef: no,
          date: dto.date,
          dueDate: null,
          projectId: wo.projectId,
          purchaseOrderId: null,
          goodsReceiptId: null,
          notes: `Subcontract bill ${no} (${wo.no})`,
          lines: measured.map((m) => ({ description: m.wl.description, itemId: null, quantity: q4(m.current), unitPrice: m.wl.rate, vatCodeId: null, accountId: null })),
        },
        { subcontractBillId: sb.id, retentionAmount: m2(retention) },
      );
      await this.bills.postIn(tx, billId);
      await tx.update(t.subcontractBills).set({ billId }).where(eq(t.subcontractBills.id, sb.id));
      return sb.id;
    });
    await this.audit.log('post', 'subcontract_bill', id, null, dto);
    const [sb] = await this.ctx.db.select().from(t.subcontractBills).where(eq(t.subcontractBills.id, id));
    return sb;
  }

  // ---------------- RA bills ----------------

  async listRaBills(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(q.projectId ? eq(t.raBills.projectId, q.projectId) : undefined, q.status ? eq(t.raBills.status, q.status) : undefined);
    const data = await db
      .select({
        id: t.raBills.id,
        no: t.raBills.no,
        sequence: t.raBills.sequence,
        date: t.raBills.date,
        projectName: t.projects.name,
        grossAmount: t.raBills.grossAmount,
        retentionAmount: t.raBills.retentionAmount,
        advanceRecovery: t.raBills.advanceRecovery,
        vatAmount: t.raBills.vatAmount,
        netAmount: t.raBills.netAmount,
        status: t.raBills.status,
        invoiceId: t.raBills.invoiceId,
      })
      .from(t.raBills)
      .innerJoin(t.projects, eq(t.projects.id, t.raBills.projectId))
      .where(where)
      .orderBy(desc(t.raBills.date), desc(t.raBills.sequence))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.raBills).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async getRaBill(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ ra: t.raBills, projectName: t.projects.name, projectCode: t.projects.code, clientName: t.parties.name })
      .from(t.raBills)
      .innerJoin(t.projects, eq(t.projects.id, t.raBills.projectId))
      .leftJoin(t.parties, eq(t.parties.id, t.projects.clientId))
      .where(eq(t.raBills.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db
      .select({ line: t.raBillLines, code: t.boqItems.code, description: t.boqItems.description, uom: t.boqItems.uom, boqQty: t.boqItems.quantity })
      .from(t.raBillLines)
      .innerJoin(t.boqItems, eq(t.boqItems.id, t.raBillLines.boqItemId))
      .where(eq(t.raBillLines.raBillId, id))
      .orderBy(asc(t.boqItems.sortOrder), asc(t.boqItems.code));
    return {
      ...row.ra,
      projectName: row.projectName,
      projectCode: row.projectCode,
      clientName: row.clientName,
      lines: lines.map((l) => ({ ...l.line, code: l.code, description: l.description, uom: l.uom, boqQty: l.boqQty, cumulativeQty: q4(D(l.line.previousQty).plus(l.line.currentQty)) })),
    };
  }

  async createRaBill(dto: RaBillDto) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const [project] = await tx.select().from(t.projects).where(eq(t.projects.id, dto.projectId)).for('update');
      if (!project) throw new NotFoundException('Project not found');
      if (!project.clientId) throw new BadRequestException('Project has no client');
      const [pendingDraft] = await tx.select({ id: t.raBills.id }).from(t.raBills).where(and(eq(t.raBills.projectId, project.id), inArray(t.raBills.status, ['draft', 'submitted'])));
      if (pendingDraft) throw new BadRequestException('Approve or cancel the pending RA bill first');
      const boq = await tx.select().from(t.boqItems).where(and(eq(t.boqItems.projectId, project.id), inArray(t.boqItems.id, dto.lines.map((l) => l.boqItemId))));
      const lines = dto.lines.map((l) => {
        const b = boq.find((x) => x.id === l.boqItemId);
        if (!b || b.isSection) throw new BadRequestException('Invalid BOQ item');
        return { boq: b, currentQty: l.currentQty };
      });
      const [adv] = await tx
        .select({ recovered: sql<string>`coalesce(sum(${t.raBills.advanceRecovery}), 0)` })
        .from(t.raBills)
        .where(and(eq(t.raBills.projectId, project.id), eq(t.raBills.status, 'approved')));
      const c = computeRaBill({
        lines: lines.map((l) => ({ rate: l.boq.rate, previousQty: l.boq.executedQty, currentQty: l.currentQty, quantity: l.boq.quantity })),
        retentionPercent: project.retentionPercent,
        vatPercent: project.vatPercent,
        advanceRecoveryPercent: project.advanceRecoveryPercent,
        advanceOutstanding: m2(D(project.mobilizationAdvance).minus(adv.recovered)),
      });
      const [{ seq }] = await tx.select({ seq: sql<number>`coalesce(max(${t.raBills.sequence}), 0)::int + 1` }).from(t.raBills).where(eq(t.raBills.projectId, project.id));
      const [ra] = await tx
        .insert(t.raBills)
        .values({
          no: `${project.code}-RA-${seq}`,
          projectId: project.id,
          sequence: seq,
          date: dto.date,
          periodFrom: dto.periodFrom,
          periodTo: dto.periodTo,
          grossAmount: m2(c.gross),
          retentionAmount: m2(c.retention),
          advanceRecovery: m2(c.recovery),
          vatAmount: m2(c.vat),
          netAmount: m2(c.net),
          remarks: dto.remarks,
        })
        .returning({ id: t.raBills.id });
      await tx.insert(t.raBillLines).values(
        lines.map((l, i) => ({ raBillId: ra.id, boqItemId: l.boq.id, previousQty: l.boq.executedQty, currentQty: q4(l.currentQty), rate: l.boq.rate, amount: m2(c.amounts[i]) })),
      );
      return ra.id;
    });
    await this.audit.log('create', 'ra_bill', id, null, dto);
    return this.getRaBill(id);
  }

  /** Approving an RA bill books the client invoice (revenue, VAT, retention, advance recovery) and advances BOQ executed qty. */
  async approveRaBill(id: string) {
    await this.ctx.db.transaction(async (tx) => {
      const [ra] = await tx.select().from(t.raBills).where(eq(t.raBills.id, id)).for('update');
      if (!ra) throw new NotFoundException();
      if (!['draft', 'submitted'].includes(ra.status)) throw new BadRequestException(`RA bill is ${ra.status}`);
      const [project] = await tx.select().from(t.projects).where(eq(t.projects.id, ra.projectId));
      const lines = await tx
        .select({ line: t.raBillLines, boq: t.boqItems })
        .from(t.raBillLines)
        .innerJoin(t.boqItems, eq(t.boqItems.id, t.raBillLines.boqItemId))
        .where(eq(t.raBillLines.raBillId, id));
      for (const l of lines) {
        if (D(l.boq.executedQty).plus(l.line.currentQty).greaterThan(D(l.boq.quantity))) {
          throw new BadRequestException(`BOQ ${l.boq.code}: cumulative quantity exceeds BOQ`);
        }
      }
      let vatCodeId: string | null = null;
      if (D(project.vatPercent).greaterThan(0)) {
        const [code] = await tx
          .select()
          .from(t.taxCodes)
          .where(and(eq(t.taxCodes.kind, 'vat'), sql`${t.taxCodes.rate} = ${project.vatPercent}`));
        if (!code) throw new BadRequestException(`No VAT code with rate ${project.vatPercent}% — create one in Tax Codes`);
        vatCodeId = code.id;
      }
      const invoiceId = await this.invoices.createIn(
        tx,
        {
          partyId: project.clientId!,
          date: ra.date,
          dueDate: null,
          projectId: project.id,
          mushakNo: null,
          retentionAmount: ra.retentionAmount,
          advanceAdjustment: ra.advanceRecovery,
          notes: `Running bill ${ra.no}`,
          lines: lines.map((l) => ({
            description: `${l.boq.code} ${l.boq.description}`.slice(0, 500),
            itemId: null,
            quantity: l.line.currentQty,
            unitPrice: l.line.rate,
            vatCodeId,
            accountId: null,
          })),
        },
        { raBillId: ra.id },
      );
      await this.invoices.postIn(tx, invoiceId);
      for (const l of lines) {
        await tx.update(t.boqItems).set({ executedQty: sql`${t.boqItems.executedQty} + ${l.line.currentQty}` }).where(eq(t.boqItems.id, l.boq.id));
      }
      await tx.update(t.raBills).set({ status: 'approved', invoiceId }).where(eq(t.raBills.id, id));
    });
    await this.audit.log('approve', 'ra_bill', id);
    return this.getRaBill(id);
  }

  /** Cancels a draft, or the latest approved RA bill whose invoice has no receipts (reverses GL and BOQ progress). */
  async cancelRaBill(id: string) {
    await this.ctx.db.transaction(async (tx) => {
      const [ra] = await tx.select().from(t.raBills).where(eq(t.raBills.id, id)).for('update');
      if (!ra) throw new NotFoundException();
      if (ra.status === 'cancelled') throw new BadRequestException('Already cancelled');
      if (ra.status === 'approved') {
        const [{ maxSeq }] = await tx
          .select({ maxSeq: sql<number>`max(${t.raBills.sequence})::int` })
          .from(t.raBills)
          .where(and(eq(t.raBills.projectId, ra.projectId), eq(t.raBills.status, 'approved')));
        if (maxSeq !== ra.sequence) throw new BadRequestException('Only the latest approved RA bill can be cancelled');
        const [inv] = await tx.select().from(t.invoices).where(eq(t.invoices.id, ra.invoiceId!));
        if (D(inv.paidAmount).greaterThan(0)) throw new BadRequestException('Invoice has receipts; reverse them first');
        if (inv.journalEntryId) await this.posting.reverse(tx, inv.journalEntryId, new Date().toISOString().slice(0, 10));
        await tx.update(t.invoices).set({ status: 'cancelled' }).where(eq(t.invoices.id, inv.id));
        const lines = await tx.select().from(t.raBillLines).where(eq(t.raBillLines.raBillId, id));
        for (const l of lines) {
          await tx.update(t.boqItems).set({ executedQty: sql`${t.boqItems.executedQty} - ${l.currentQty}` }).where(eq(t.boqItems.id, l.boqItemId));
        }
      }
      await tx.update(t.raBills).set({ status: 'cancelled' }).where(eq(t.raBills.id, id));
    });
    await this.audit.log('cancel', 'ra_bill', id);
    return this.getRaBill(id);
  }

  // ---------------- DPR ----------------

  listDpr(projectId: string) {
    return this.ctx.db
      .select()
      .from(t.dailyProgressReports)
      .where(eq(t.dailyProgressReports.projectId, projectId))
      .orderBy(desc(t.dailyProgressReports.date))
      .limit(200);
  }

  async saveDpr(dto: DprDto) {
    const values = { ...dto, preparedBy: this.ctx.userId };
    const [row] = await this.ctx.db
      .insert(t.dailyProgressReports)
      .values(values)
      .onConflictDoUpdate({ target: [t.dailyProgressReports.projectId, t.dailyProgressReports.date], set: values })
      .returning();
    await this.audit.log('update', 'dpr', row.id, null, dto);
    return row;
  }

  // ---------------- equipment usage ----------------

  async logEquipment(dto: { equipmentId: string; projectId: string; date: string; hours: string; fuelLiters: string; operatorId?: string | null; remarks?: string | null }) {
    const [eq_] = await this.ctx.db.select().from(t.equipment).where(eq(t.equipment.id, dto.equipmentId));
    if (!eq_) throw new NotFoundException('Equipment not found');
    const [row] = await this.ctx.db
      .insert(t.equipmentLogs)
      .values({ ...dto, hours: q4(dto.hours), fuelLiters: q4(dto.fuelLiters), cost: m2(D(dto.hours).times(eq_.hourlyRate)) })
      .returning();
    await this.audit.log('create', 'equipment_log', row.id, null, row);
    return row;
  }

  equipmentLogs(q: { projectId?: string; equipmentId?: string }) {
    return this.ctx.db
      .select({ log: t.equipmentLogs, equipmentName: t.equipment.name, equipmentCode: t.equipment.code, projectName: t.projects.name })
      .from(t.equipmentLogs)
      .innerJoin(t.equipment, eq(t.equipment.id, t.equipmentLogs.equipmentId))
      .innerJoin(t.projects, eq(t.projects.id, t.equipmentLogs.projectId))
      .where(and(q.projectId ? eq(t.equipmentLogs.projectId, q.projectId) : undefined, q.equipmentId ? eq(t.equipmentLogs.equipmentId, q.equipmentId) : undefined))
      .orderBy(desc(t.equipmentLogs.date))
      .limit(500)
      .then((rows) => rows.map((r) => ({ ...r.log, equipmentName: r.equipmentName, equipmentCode: r.equipmentCode, projectName: r.projectName })));
  }

  // ---------------- variation orders ----------------

  listVariations(projectId: string) {
    return this.ctx.db.select().from(t.variationOrders).where(eq(t.variationOrders.projectId, projectId)).orderBy(desc(t.variationOrders.date));
  }

  async createVariation(dto: { projectId: string; date: string; description: string; amount: string }) {
    const [{ n }] = await this.ctx.db.select({ n: sql<number>`count(*)::int + 1` }).from(t.variationOrders).where(eq(t.variationOrders.projectId, dto.projectId));
    const [row] = await this.ctx.db.insert(t.variationOrders).values({ ...dto, amount: m2(dto.amount), no: `VO-${n}` }).returning();
    await this.audit.log('create', 'variation_order', row.id, null, row);
    return row;
  }

  /** Approved VO adjusts the contract value. */
  async decideVariation(id: string, status: 'approved' | 'rejected') {
    const row = await this.ctx.db.transaction(async (tx) => {
      const [vo] = await tx.select().from(t.variationOrders).where(eq(t.variationOrders.id, id)).for('update');
      if (!vo) throw new NotFoundException();
      if (vo.status !== 'pending') throw new BadRequestException(`Variation is ${vo.status}`);
      if (status === 'approved') {
        await tx.update(t.projects).set({ contractValue: sql`${t.projects.contractValue} + ${vo.amount}` }).where(eq(t.projects.id, vo.projectId));
      }
      const [r] = await tx.update(t.variationOrders).set({ status }).where(eq(t.variationOrders.id, id)).returning();
      return r;
    });
    await this.audit.log(status === 'approved' ? 'approve' : 'reject', 'variation_order', id, null, row);
    return row;
  }
}
