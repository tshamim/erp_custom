import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { ListQuery } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { D, m2 } from '../../common/money';
import { searchClause } from '../../common/pagination';

const VENDOR_TYPES = ['vendor', 'subcontractor'];
const today = () => new Date().toISOString().slice(0, 10);
const in30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

/** Purchasing from a vendor/subcontractor is blocked unless it is approved. */
export async function assertVendorApproved(db: TenantDb, partyId: string) {
  const [p] = await db.select({ name: t.parties.name, type: t.parties.type, status: t.parties.vendorStatus }).from(t.parties).where(eq(t.parties.id, partyId));
  if (!p) throw new BadRequestException('Party not found');
  if (VENDOR_TYPES.includes(p.type) && p.status !== 'approved') {
    throw new BadRequestException(`${p.name} is ${p.status.replace('_', ' ')} — only approved vendors can receive orders`);
  }
}

@Injectable()
export class VendorsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  /**
   * Correlated sub-selects are written with explicit table prefixes: Drizzle renders bare column
   * names in a join-less select, which would make `party_id = id` refer to the sub-select's own table.
   */
  private rating = sql<string | null>`(select round(avg((ve.quality + ve.delivery + ve.price + ve.service) / 4.0), 2)
    from vendor_evaluations ve where ve.party_id = parties.id)`;

  async list(q: ListQuery & { category?: string }) {
    const db = this.ctx.db;
    const where = and(
      inArray(t.parties.type, q.type ? [q.type] : VENDOR_TYPES),
      searchClause(q, [t.parties.code, t.parties.name, t.parties.phone, t.parties.vendorCategory, t.parties.binNo]),
      q.status ? eq(t.parties.vendorStatus, q.status) : undefined,
      q.category ? eq(t.parties.vendorCategory, q.category) : undefined,
    );
    const data = await db
      .select({
        id: t.parties.id,
        code: t.parties.code,
        name: t.parties.name,
        type: t.parties.type,
        vendorCategory: t.parties.vendorCategory,
        vendorStatus: t.parties.vendorStatus,
        phone: t.parties.phone,
        rating: this.rating,
        purchases: sql<string>`coalesce((select sum(po.total) from purchase_orders po where po.party_id = parties.id and po.status <> 'cancelled'), 0)`,
        payable: sql<string>`coalesce((select sum(b.total - b.paid_amount) from bills b where b.party_id = parties.id and b.status in ('posted','partially_paid')), 0)`,
        expiredDocs: sql<number>`(select count(*)::int from vendor_documents vd where vd.party_id = parties.id and vd.expiry_date < ${today()})`,
      })
      .from(t.parties)
      .where(where)
      .orderBy(asc(t.parties.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.parties).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async categories() {
    const rows = await this.ctx.db
      .selectDistinct({ c: t.parties.vendorCategory })
      .from(t.parties)
      .where(sql`${t.parties.vendorCategory} is not null`);
    return rows.map((r) => r.c).filter(Boolean).sort();
  }

  /** Everything about one vendor on one page. */
  async view360(id: string) {
    const db = this.ctx.db;
    const [party] = await db.select().from(t.parties).where(eq(t.parties.id, id));
    if (!party || !VENDOR_TYPES.includes(party.type)) throw new NotFoundException('Vendor not found');

    const [po] = await db
      .select({ count: sql<number>`count(*)::int`, value: sql<string>`coalesce(sum(${t.purchaseOrders.total}), 0)` })
      .from(t.purchaseOrders)
      .where(and(eq(t.purchaseOrders.partyId, id), ne(t.purchaseOrders.status, 'cancelled')));
    const [bill] = await db
      .select({
        billed: sql<string>`coalesce(sum(${t.bills.total}), 0)`,
        outstanding: sql<string>`coalesce(sum(${t.bills.total} - ${t.bills.paidAmount}) filter (where ${t.bills.status} in ('posted','partially_paid')), 0)`,
        retention: sql<string>`coalesce(sum(${t.bills.retentionAmount}), 0)`,
      })
      .from(t.bills)
      .where(and(eq(t.bills.partyId, id), inArray(t.bills.status, ['posted', 'partially_paid', 'paid'])));
    const [paid] = await db
      .select({ gross: sql<string>`coalesce(sum(${t.payments.amount}), 0)`, tds: sql<string>`coalesce(sum(${t.payments.tdsAmount}), 0)`, vds: sql<string>`coalesce(sum(${t.payments.vdsAmount}), 0)` })
      .from(t.payments)
      .where(and(eq(t.payments.partyId, id), eq(t.payments.direction, 'out'), eq(t.payments.status, 'posted')));

    // Delivery performance: first GRN vs PO expected date / PO date.
    const delivery = await db.execute(sql`
      select po.id, po.date, po.expected_date, min(g.date) as first_grn
      from purchase_orders po join goods_receipts g on g.order_id = po.id and g.status = 'posted'
      where po.party_id = ${id} group by po.id, po.date, po.expected_date`);
    const drows = delivery.rows as { date: string; expected_date: string | null; first_grn: string }[];
    const withDue = drows.filter((r) => r.expected_date);
    const onTime = withDue.filter((r) => String(r.first_grn) <= String(r.expected_date)).length;
    const leadDays = drows.map((r) => (Date.parse(r.first_grn) - Date.parse(r.date)) / 86_400_000);

    const evaluations = await db
      .select({ e: t.vendorEvaluations, by: t.users.name })
      .from(t.vendorEvaluations)
      .leftJoin(t.users, eq(t.users.id, t.vendorEvaluations.evaluatedBy))
      .where(eq(t.vendorEvaluations.partyId, id))
      .orderBy(desc(t.vendorEvaluations.date));
    const avg = (k: 'quality' | 'delivery' | 'price' | 'service') => (evaluations.length ? evaluations.reduce((a, x) => a + x.e[k], 0) / evaluations.length : null);
    const documents = (await db.select().from(t.vendorDocuments).where(eq(t.vendorDocuments.partyId, id)).orderBy(asc(t.vendorDocuments.expiryDate))).map((d) => ({
      ...d,
      state: !d.expiryDate ? 'valid' : d.expiryDate < today() ? 'expired' : d.expiryDate <= in30() ? 'expiring' : 'valid',
    }));

    const [orders, receipts, bills, payments, workOrders, priceHistory] = await Promise.all([
      db.select({ id: t.purchaseOrders.id, no: t.purchaseOrders.no, date: t.purchaseOrders.date, total: t.purchaseOrders.total, status: t.purchaseOrders.status }).from(t.purchaseOrders).where(eq(t.purchaseOrders.partyId, id)).orderBy(desc(t.purchaseOrders.date)).limit(20),
      db.select({ id: t.goodsReceipts.id, no: t.goodsReceipts.no, date: t.goodsReceipts.date, challanNo: t.goodsReceipts.challanNo, status: t.goodsReceipts.status }).from(t.goodsReceipts).where(eq(t.goodsReceipts.partyId, id)).orderBy(desc(t.goodsReceipts.date)).limit(20),
      db.select({ id: t.bills.id, no: t.bills.no, date: t.bills.date, total: t.bills.total, paidAmount: t.bills.paidAmount, status: t.bills.status }).from(t.bills).where(eq(t.bills.partyId, id)).orderBy(desc(t.bills.date)).limit(20),
      db.select({ id: t.payments.id, no: t.payments.no, date: t.payments.date, amount: t.payments.amount, tdsAmount: t.payments.tdsAmount, method: t.payments.method, status: t.payments.status }).from(t.payments).where(and(eq(t.payments.partyId, id), eq(t.payments.direction, 'out'))).orderBy(desc(t.payments.date)).limit(20),
      db.select({ id: t.workOrders.id, no: t.workOrders.no, date: t.workOrders.date, value: t.workOrders.value, status: t.workOrders.status, projectName: t.projects.name }).from(t.workOrders).innerJoin(t.projects, eq(t.projects.id, t.workOrders.projectId)).where(eq(t.workOrders.partyId, id)).orderBy(desc(t.workOrders.date)).limit(20),
      db
        .select({ date: t.purchaseOrders.date, poNo: t.purchaseOrders.no, itemCode: t.items.code, itemName: t.items.name, quantity: t.purchaseOrderLines.quantity, unitPrice: t.purchaseOrderLines.unitPrice })
        .from(t.purchaseOrderLines)
        .innerJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.purchaseOrderLines.orderId))
        .innerJoin(t.items, eq(t.items.id, t.purchaseOrderLines.itemId))
        .where(and(eq(t.purchaseOrders.partyId, id), ne(t.purchaseOrders.status, 'cancelled')))
        .orderBy(desc(t.purchaseOrders.date))
        .limit(100),
    ]);

    return {
      party,
      kpis: {
        poCount: po.count,
        poValue: m2(po.value),
        billed: m2(bill.billed),
        paid: m2(paid.gross),
        tdsDeducted: m2(paid.tds),
        vdsDeducted: m2(paid.vds),
        outstanding: m2(bill.outstanding),
        retentionHeld: m2(bill.retention),
        onTimeDeliveryPct: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
        avgLeadTimeDays: leadDays.length ? Number((leadDays.reduce((a, b) => a + b, 0) / leadDays.length).toFixed(1)) : null,
        deliveries: drows.length,
      },
      rating: evaluations.length
        ? { overall: Number(((avg('quality')! + avg('delivery')! + avg('price')! + avg('service')!) / 4).toFixed(2)), quality: avg('quality'), delivery: avg('delivery'), price: avg('price'), service: avg('service'), count: evaluations.length }
        : null,
      evaluations: evaluations.map((x) => ({ ...x.e, evaluatedByName: x.by })),
      documents,
      orders,
      receipts,
      bills,
      payments,
      workOrders,
      priceHistory,
    };
  }

  async setStatus(id: string, status: string, reason?: string | null) {
    const [before] = await this.ctx.db.select().from(t.parties).where(eq(t.parties.id, id));
    if (!before || !VENDOR_TYPES.includes(before.type)) throw new NotFoundException('Vendor not found');
    if (status === 'blacklisted' && !reason) throw new BadRequestException('A reason is required to blacklist a vendor');
    const [row] = await this.ctx.db
      .update(t.parties)
      .set({ vendorStatus: status, blacklistReason: status === 'blacklisted' ? reason : null })
      .where(eq(t.parties.id, id))
      .returning();
    await this.audit.log(status === 'approved' ? 'approve' : status, 'vendor', id, { status: before.vendorStatus }, { status, reason });
    return row;
  }

  async addEvaluation(dto: { partyId: string; date: string; quality: number; delivery: number; price: number; service: number; remarks?: string | null }) {
    const [row] = await this.ctx.db.insert(t.vendorEvaluations).values({ ...dto, evaluatedBy: this.ctx.userId }).returning();
    await this.audit.log('create', 'vendor_evaluation', row.id, null, row);
    return row;
  }

  async deleteEvaluation(id: string) {
    await this.ctx.db.delete(t.vendorEvaluations).where(eq(t.vendorEvaluations.id, id));
    await this.audit.log('delete', 'vendor_evaluation', id);
    return { ok: true };
  }

  async addDocument(dto: { partyId: string; docType: string; docNo?: string | null; issueDate?: string | null; expiryDate?: string | null; remarks?: string | null }) {
    const [row] = await this.ctx.db.insert(t.vendorDocuments).values(dto).returning();
    await this.audit.log('create', 'vendor_document', row.id, null, row);
    return row;
  }

  async deleteDocument(id: string) {
    await this.ctx.db.delete(t.vendorDocuments).where(eq(t.vendorDocuments.id, id));
    await this.audit.log('delete', 'vendor_document', id);
    return { ok: true };
  }

  /** Compliance documents already expired or expiring within 30 days. */
  compliance() {
    return this.ctx.db
      .select({ doc: t.vendorDocuments, partyName: t.parties.name, partyId: t.parties.id, vendorStatus: t.parties.vendorStatus })
      .from(t.vendorDocuments)
      .innerJoin(t.parties, eq(t.parties.id, t.vendorDocuments.partyId))
      .where(lte(t.vendorDocuments.expiryDate, in30()))
      .orderBy(asc(t.vendorDocuments.expiryDate))
      .then((rows) => rows.map((r) => ({ ...r.doc, partyName: r.partyName, vendorStatus: r.vendorStatus, state: r.doc.expiryDate! < today() ? 'expired' : 'expiring', daysLeft: Math.round((Date.parse(r.doc.expiryDate!) - Date.parse(today())) / 86_400_000) })));
  }

  /** Vendor comparison per item: last and average price by vendor (supports sourcing decisions). */
  async priceComparison(itemId: string) {
    const rows = await this.ctx.db
      .select({
        partyId: t.parties.id,
        partyName: t.parties.name,
        vendorStatus: t.parties.vendorStatus,
        orders: sql<number>`count(*)::int`,
        avgPrice: sql<string>`round(avg(${t.purchaseOrderLines.unitPrice}), 2)`,
        minPrice: sql<string>`min(${t.purchaseOrderLines.unitPrice})`,
        lastDate: sql<string>`max(${t.purchaseOrders.date})`,
      })
      .from(t.purchaseOrderLines)
      .innerJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.purchaseOrderLines.orderId))
      .innerJoin(t.parties, eq(t.parties.id, t.purchaseOrders.partyId))
      .where(and(eq(t.purchaseOrderLines.itemId, itemId), ne(t.purchaseOrders.status, 'cancelled')))
      .groupBy(t.parties.id, t.parties.name, t.parties.vendorStatus)
      .orderBy(sql`avg(${t.purchaseOrderLines.unitPrice})`);
    return rows.map((r) => ({ ...r, avgPrice: m2(D(r.avgPrice)) }));
  }
}
