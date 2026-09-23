import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { BillDto, InvoiceDto, ListQuery, PartyDto, PaymentDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PostingService, PostLine } from '../../ledger/posting.service';
import { D, Decimal, m2, pct, q4, sum } from '../../common/money';
import { searchClause } from '../../common/pagination';

interface DocLineInput {
  description: string;
  itemId?: string | null;
  quantity: string;
  unitPrice: string;
  vatCodeId?: string | null;
  accountId?: string | null;
}

/** Computes line amounts and VAT from tax-code rates. Pure apart from the tax-code lookup map. */
export function computeLines(lines: DocLineInput[], vatRates: Map<string, string>) {
  const out = lines.map((l, i) => {
    const amount = D(l.quantity).times(D(l.unitPrice)).toDecimalPlaces(2);
    const rate = l.vatCodeId ? vatRates.get(l.vatCodeId) : undefined;
    if (l.vatCodeId && rate === undefined) throw new BadRequestException(`Unknown VAT code on line ${i + 1}`);
    const vat = rate ? pct(amount, rate) : new Decimal(0);
    return { ...l, lineNo: i + 1, amount, vat };
  });
  return { lines: out, subtotal: sum(out.map((l) => l.amount)), vat: sum(out.map((l) => l.vat)) };
}

@Injectable()
export class PartiesService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.parties.code, t.parties.name, t.parties.phone, t.parties.binNo]),
      q.type ? eq(t.parties.type, q.type) : undefined,
    );
    // Explicit table prefixes: Drizzle renders bare column names in a join-less select,
    // which would make `party_id = id` resolve inside the sub-select's own table.
    const receivable = sql<string>`coalesce((select sum(i.total - i.paid_amount) from invoices i
      where i.party_id = parties.id and i.status in ('posted','partially_paid')), 0)`;
    const payable = sql<string>`coalesce((select sum(b.total - b.paid_amount) from bills b
      where b.party_id = parties.id and b.status in ('posted','partially_paid')), 0)`;
    const data = await db
      .select({
        id: t.parties.id,
        code: t.parties.code,
        type: t.parties.type,
        name: t.parties.name,
        phone: t.parties.phone,
        email: t.parties.email,
        binNo: t.parties.binNo,
        tin: t.parties.tin,
        isActive: t.parties.isActive,
        receivable,
        payable,
      })
      .from(t.parties)
      .where(where)
      .orderBy(asc(t.parties.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.parties).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const [p] = await this.ctx.db.select().from(t.parties).where(eq(t.parties.id, id));
    if (!p) throw new NotFoundException();
    return p;
  }

  async create(dto: PartyDto) {
    const code = dto.code || (await this.numbering.next(this.ctx.db, `party_${dto.type}`));
    const [row] = await this.ctx.db
      .insert(t.parties)
      .values({ ...dto, code, email: dto.email || null })
      .returning();
    await this.audit.log('create', 'party', row.id, null, row);
    return row;
  }

  async update(id: string, dto: Partial<PartyDto>) {
    const before = await this.get(id);
    const [row] = await this.ctx.db
      .update(t.parties)
      .set({ ...dto, email: dto.email === '' ? null : dto.email })
      .where(eq(t.parties.id, id))
      .returning();
    await this.audit.log('update', 'party', id, before, row);
    return row;
  }

  /** Party statement: posted invoices/bills/payments in date order with running balance. */
  async statement(id: string) {
    const party = await this.get(id);
    const db = this.ctx.db;
    const rows = await db
      .select({
        date: t.journalEntries.date,
        no: t.journalEntries.no,
        sourceType: t.journalEntries.sourceType,
        narration: t.journalEntries.narration,
        debit: t.journalLines.debit,
        credit: t.journalLines.credit,
        account: t.accounts.code,
      })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .innerJoin(t.accounts, eq(t.accounts.id, t.journalLines.accountId))
      .where(and(eq(t.journalLines.partyId, id), sql`${t.accounts.subtype} in ('receivable','payable')`))
      .orderBy(asc(t.journalEntries.date), asc(t.journalEntries.no));
    let running = new Decimal(0);
    return {
      party,
      lines: rows.map((r) => {
        running = running.plus(D(r.debit)).minus(D(r.credit));
        return { ...r, balance: running.toFixed(2) };
      }),
    };
  }
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
  ) {}

  private async vatRates(db: TenantDb) {
    const rows = await db.select({ id: t.taxCodes.id, rate: t.taxCodes.rate }).from(t.taxCodes).where(eq(t.taxCodes.kind, 'vat'));
    return new Map(rows.map((r) => [r.id, r.rate]));
  }

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.invoices.no, t.parties.name, t.invoices.mushakNo]),
      q.status ? eq(t.invoices.status, q.status) : undefined,
      q.partyId ? eq(t.invoices.partyId, q.partyId) : undefined,
      q.projectId ? eq(t.invoices.projectId, q.projectId) : undefined,
      q.from ? gte(t.invoices.date, q.from) : undefined,
      q.to ? lte(t.invoices.date, q.to) : undefined,
    );
    const data = await db
      .select({
        id: t.invoices.id,
        no: t.invoices.no,
        date: t.invoices.date,
        dueDate: t.invoices.dueDate,
        partyName: t.parties.name,
        projectName: t.projects.name,
        subtotal: t.invoices.subtotal,
        vatAmount: t.invoices.vatAmount,
        total: t.invoices.total,
        paidAmount: t.invoices.paidAmount,
        status: t.invoices.status,
      })
      .from(t.invoices)
      .innerJoin(t.parties, eq(t.parties.id, t.invoices.partyId))
      .leftJoin(t.projects, eq(t.projects.id, t.invoices.projectId))
      .where(where)
      .orderBy(desc(t.invoices.date), desc(t.invoices.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.invoices)
      .innerJoin(t.parties, eq(t.parties.id, t.invoices.partyId))
      .where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ inv: t.invoices, partyName: t.parties.name, partyBin: t.parties.binNo, partyAddress: t.parties.address, projectName: t.projects.name })
      .from(t.invoices)
      .innerJoin(t.parties, eq(t.parties.id, t.invoices.partyId))
      .leftJoin(t.projects, eq(t.projects.id, t.invoices.projectId))
      .where(eq(t.invoices.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db.select().from(t.invoiceLines).where(eq(t.invoiceLines.invoiceId, id)).orderBy(asc(t.invoiceLines.lineNo));
    return { ...row.inv, partyName: row.partyName, partyBin: row.partyBin, partyAddress: row.partyAddress, projectName: row.projectName, lines };
  }

  /** Creates a draft invoice inside `db` (transaction-friendly). Returns id. */
  async createIn(db: TenantDb, dto: InvoiceDto, extra: { raBillId?: string } = {}) {
    const c = computeLines(dto.lines, await this.vatRates(db));
    const receivable = c.subtotal.plus(c.vat).minus(D(dto.retentionAmount)).minus(D(dto.advanceAdjustment));
    if (receivable.isNegative()) throw new BadRequestException('Retention + advance adjustment exceed invoice amount');
    const no = await this.numbering.next(db, 'invoice', dto.date);
    const [inv] = await db
      .insert(t.invoices)
      .values({
        no,
        partyId: dto.partyId,
        date: dto.date,
        dueDate: dto.dueDate,
        projectId: dto.projectId,
        raBillId: extra.raBillId,
        mushakNo: dto.mushakNo,
        subtotal: m2(c.subtotal),
        vatAmount: m2(c.vat),
        retentionAmount: m2(dto.retentionAmount),
        advanceAdjustment: m2(dto.advanceAdjustment),
        total: m2(receivable),
        notes: dto.notes,
        createdBy: this.ctx.userId,
      })
      .returning({ id: t.invoices.id });
    await db.insert(t.invoiceLines).values(
      c.lines.map((l) => ({
        invoiceId: inv.id,
        lineNo: l.lineNo,
        description: l.description,
        itemId: l.itemId,
        quantity: q4(l.quantity),
        unitPrice: m2(l.unitPrice),
        amount: m2(l.amount),
        vatCodeId: l.vatCodeId,
        vatAmount: m2(l.vat),
        incomeAccountId: l.accountId,
      })),
    );
    return inv.id;
  }

  /**
   * Dr AR (receivable) + Dr Retention receivable + Dr Client advance (recovery)
   *   Cr Revenue (per line) + Cr VAT output
   */
  async postIn(db: TenantDb, id: string) {
    const [inv] = await db.select().from(t.invoices).where(eq(t.invoices.id, id)).for('update');
    if (!inv) throw new NotFoundException();
    if (inv.status !== 'draft') throw new BadRequestException(`Invoice is ${inv.status}`);
    const lines = await db.select().from(t.invoiceLines).where(eq(t.invoiceLines.invoiceId, id));
    const p = { partyId: inv.partyId, projectId: inv.projectId };
    const post: PostLine[] = [
      { account: 'ar', debit: inv.total, ...p, description: `Invoice ${inv.no}` },
      { account: 'retention_receivable', debit: inv.retentionAmount, ...p },
      { account: 'client_advance', debit: inv.advanceAdjustment, ...p, description: 'Mobilization advance recovery' },
      ...lines.map((l) => ({
        account: l.incomeAccountId ? { id: l.incomeAccountId } : 'revenue',
        credit: l.amount,
        projectId: inv.projectId,
        description: l.description,
      })),
      { account: 'vat_output', credit: inv.vatAmount, ...p, description: `VAT on ${inv.no}` },
    ];
    const entryId = await this.posting.post(db, {
      date: inv.date,
      sourceType: 'invoice',
      sourceId: inv.id,
      reference: inv.no,
      narration: `Sales invoice ${inv.no}`,
      lines: post,
    });
    await db.update(t.invoices).set({ status: 'posted', journalEntryId: entryId }).where(eq(t.invoices.id, id));
  }

  async create(dto: InvoiceDto, post: boolean) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const id = await this.createIn(tx, dto);
      if (post) await this.postIn(tx, id);
      return id;
    });
    await this.audit.log(post ? 'post' : 'create', 'invoice', id, null, dto);
    return this.get(id);
  }

  async post(id: string) {
    await this.ctx.db.transaction((tx) => this.postIn(tx, id));
    await this.audit.log('post', 'invoice', id);
    return this.get(id);
  }

  async cancel(id: string) {
    const inv = await this.get(id);
    if (D(inv.paidAmount).greaterThan(0)) throw new BadRequestException('Invoice has receipts; reverse them first');
    if (inv.raBillId) throw new BadRequestException('Invoice belongs to an RA bill; cancel the RA bill instead');
    await this.ctx.db.transaction(async (tx) => {
      if (inv.journalEntryId) await this.posting.reverse(tx, inv.journalEntryId, new Date().toISOString().slice(0, 10));
      await tx.update(t.invoices).set({ status: 'cancelled' }).where(eq(t.invoices.id, id));
    });
    await this.audit.log('cancel', 'invoice', id);
    return this.get(id);
  }
}

@Injectable()
export class BillsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
  ) {}

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.bills.no, t.parties.name, t.bills.vendorRef]),
      q.status ? eq(t.bills.status, q.status) : undefined,
      q.partyId ? eq(t.bills.partyId, q.partyId) : undefined,
      q.projectId ? eq(t.bills.projectId, q.projectId) : undefined,
      q.from ? gte(t.bills.date, q.from) : undefined,
      q.to ? lte(t.bills.date, q.to) : undefined,
    );
    const data = await db
      .select({
        id: t.bills.id,
        no: t.bills.no,
        vendorRef: t.bills.vendorRef,
        date: t.bills.date,
        dueDate: t.bills.dueDate,
        partyName: t.parties.name,
        projectName: t.projects.name,
        subtotal: t.bills.subtotal,
        vatAmount: t.bills.vatAmount,
        total: t.bills.total,
        paidAmount: t.bills.paidAmount,
        status: t.bills.status,
      })
      .from(t.bills)
      .innerJoin(t.parties, eq(t.parties.id, t.bills.partyId))
      .leftJoin(t.projects, eq(t.projects.id, t.bills.projectId))
      .where(where)
      .orderBy(desc(t.bills.date), desc(t.bills.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.bills)
      .innerJoin(t.parties, eq(t.parties.id, t.bills.partyId))
      .where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ bill: t.bills, partyName: t.parties.name, projectName: t.projects.name })
      .from(t.bills)
      .innerJoin(t.parties, eq(t.parties.id, t.bills.partyId))
      .leftJoin(t.projects, eq(t.projects.id, t.bills.projectId))
      .where(eq(t.bills.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db.select().from(t.billLines).where(eq(t.billLines.billId, id)).orderBy(asc(t.billLines.lineNo));
    return { ...row.bill, partyName: row.partyName, projectName: row.projectName, lines };
  }

  async createIn(db: TenantDb, dto: BillDto, extra: { subcontractBillId?: string; retentionAmount?: string } = {}) {
    const rates = await db.select({ id: t.taxCodes.id, rate: t.taxCodes.rate }).from(t.taxCodes).where(eq(t.taxCodes.kind, 'vat'));
    const c = computeLines(dto.lines, new Map(rates.map((r) => [r.id, r.rate])));
    const retention = D(extra.retentionAmount);
    const no = await this.numbering.next(db, 'bill', dto.date);
    const [bill] = await db
      .insert(t.bills)
      .values({
        no,
        partyId: dto.partyId,
        vendorRef: dto.vendorRef,
        date: dto.date,
        dueDate: dto.dueDate,
        projectId: dto.projectId,
        purchaseOrderId: dto.purchaseOrderId,
        goodsReceiptId: dto.goodsReceiptId,
        subcontractBillId: extra.subcontractBillId,
        subtotal: m2(c.subtotal),
        vatAmount: m2(c.vat),
        retentionAmount: m2(retention),
        total: m2(c.subtotal.plus(c.vat).minus(retention)),
        notes: dto.notes,
        createdBy: this.ctx.userId,
      })
      .returning({ id: t.bills.id });
    await db.insert(t.billLines).values(
      c.lines.map((l) => ({
        billId: bill.id,
        lineNo: l.lineNo,
        description: l.description,
        itemId: l.itemId,
        quantity: q4(l.quantity),
        unitPrice: m2(l.unitPrice),
        amount: m2(l.amount),
        vatCodeId: l.vatCodeId,
        vatAmount: m2(l.vat),
        expenseAccountId: l.accountId,
      })),
    );
    return bill.id;
  }

  /**
   * Dr Expense / GRNI / Subcontract cost (per line) + Dr VAT input
   *   Cr AP (payable) + Cr Retention payable
   */
  async postIn(db: TenantDb, id: string) {
    const [bill] = await db.select().from(t.bills).where(eq(t.bills.id, id)).for('update');
    if (!bill) throw new NotFoundException();
    if (bill.status !== 'draft') throw new BadRequestException(`Bill is ${bill.status}`);
    const lines = await db.select().from(t.billLines).where(eq(t.billLines.billId, id));

    const itemIds = lines.map((l) => l.itemId).filter((x): x is string => !!x);
    const itemExpense = new Map<string, string | null>();
    if (itemIds.length) {
      const rows = await db
        .select({ id: t.items.id, expense: t.itemCategories.expenseAccountId })
        .from(t.items)
        .leftJoin(t.itemCategories, eq(t.itemCategories.id, t.items.categoryId))
        .where(inArray(t.items.id, itemIds));
      rows.forEach((r) => itemExpense.set(r.id, r.expense));
    }
    const accountFor = (l: (typeof lines)[number]): PostLine['account'] => {
      if (l.expenseAccountId) return { id: l.expenseAccountId };
      if (bill.goodsReceiptId && l.itemId) return 'grni';
      if (bill.subcontractBillId) return 'subcontract_cost';
      const cat = l.itemId ? itemExpense.get(l.itemId) : null;
      if (cat) return { id: cat };
      if (l.itemId) return 'material_cost';
      throw new BadRequestException(`Line ${l.lineNo}: choose an expense account`);
    };

    const p = { partyId: bill.partyId, projectId: bill.projectId };
    const entryId = await this.posting.post(db, {
      date: bill.date,
      sourceType: bill.subcontractBillId ? 'sub_bill' : 'bill',
      sourceId: bill.id,
      reference: bill.vendorRef ?? bill.no,
      narration: `Vendor bill ${bill.no}`,
      lines: [
        ...lines.map((l) => ({ account: accountFor(l), debit: l.amount, projectId: bill.projectId, description: l.description })),
        { account: 'vat_input', debit: bill.vatAmount, ...p, description: `VAT on ${bill.no}` },
        { account: 'ap', credit: bill.total, ...p, description: `Bill ${bill.no}` },
        { account: 'retention_payable', credit: bill.retentionAmount, ...p },
      ],
    });
    await db.update(t.bills).set({ status: 'posted', journalEntryId: entryId }).where(eq(t.bills.id, id));
    if (bill.purchaseOrderId) {
      for (const l of lines.filter((x) => x.itemId)) {
        await db
          .update(t.purchaseOrderLines)
          .set({ billedQty: sql`${t.purchaseOrderLines.billedQty} + ${l.quantity}` })
          .where(and(eq(t.purchaseOrderLines.orderId, bill.purchaseOrderId), eq(t.purchaseOrderLines.itemId, l.itemId!)));
      }
    }
  }

  async create(dto: BillDto, post: boolean) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const id = await this.createIn(tx, dto);
      if (post) await this.postIn(tx, id);
      return id;
    });
    await this.audit.log(post ? 'post' : 'create', 'bill', id, null, dto);
    return this.get(id);
  }

  async post(id: string) {
    await this.ctx.db.transaction((tx) => this.postIn(tx, id));
    await this.audit.log('post', 'bill', id);
    return this.get(id);
  }

  /** Draft bill pre-filled from a posted goods receipt (qty × PO price, PO VAT codes). */
  async fromGoodsReceipt(receiptId: string) {
    const db = this.ctx.db;
    const [grn] = await db.select().from(t.goodsReceipts).where(eq(t.goodsReceipts.id, receiptId));
    if (!grn) throw new NotFoundException('Goods receipt not found');
    if (grn.status !== 'posted') throw new BadRequestException('Goods receipt is not posted');
    const [existing] = await db
      .select({ id: t.bills.id })
      .from(t.bills)
      .where(and(eq(t.bills.goodsReceiptId, receiptId), sql`${t.bills.status} <> 'cancelled'`));
    if (existing) throw new BadRequestException('A bill already exists for this goods receipt');
    const [po] = await db.select().from(t.purchaseOrders).where(eq(t.purchaseOrders.id, grn.orderId));
    const lines = await db
      .select({ grl: t.goodsReceiptLines, pol: t.purchaseOrderLines, itemName: t.items.name })
      .from(t.goodsReceiptLines)
      .innerJoin(t.purchaseOrderLines, eq(t.purchaseOrderLines.id, t.goodsReceiptLines.orderLineId))
      .innerJoin(t.items, eq(t.items.id, t.goodsReceiptLines.itemId))
      .where(eq(t.goodsReceiptLines.receiptId, receiptId));
    return this.create(
      {
        partyId: grn.partyId,
        vendorRef: grn.challanNo,
        date: grn.date,
        dueDate: null,
        projectId: po?.projectId,
        purchaseOrderId: grn.orderId,
        goodsReceiptId: grn.id,
        notes: `Against ${grn.no}`,
        lines: lines.map((l) => ({
          description: l.itemName,
          itemId: l.grl.itemId,
          quantity: l.grl.quantity,
          unitPrice: l.pol.unitPrice,
          vatCodeId: l.pol.vatCodeId,
          accountId: null,
        })),
      },
      false,
    );
  }

  async cancel(id: string) {
    const bill = await this.get(id);
    if (D(bill.paidAmount).greaterThan(0)) throw new BadRequestException('Bill has payments; reverse them first');
    if (bill.subcontractBillId) throw new BadRequestException('Bill belongs to a subcontract bill; cancel that instead');
    await this.ctx.db.transaction(async (tx) => {
      if (bill.journalEntryId) await this.posting.reverse(tx, bill.journalEntryId, new Date().toISOString().slice(0, 10));
      await tx.update(t.bills).set({ status: 'cancelled' }).where(eq(t.bills.id, id));
    });
    await this.audit.log('cancel', 'bill', id);
    return this.get(id);
  }
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
  ) {}

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.payments.no, t.parties.name, t.payments.reference, t.payments.chequeNo]),
      q.type ? eq(t.payments.direction, q.type) : undefined,
      q.partyId ? eq(t.payments.partyId, q.partyId) : undefined,
      q.status ? eq(t.payments.status, q.status) : undefined,
      q.from ? gte(t.payments.date, q.from) : undefined,
      q.to ? lte(t.payments.date, q.to) : undefined,
    );
    const data = await db
      .select({
        id: t.payments.id,
        no: t.payments.no,
        direction: t.payments.direction,
        date: t.payments.date,
        partyName: t.parties.name,
        method: t.payments.method,
        amount: t.payments.amount,
        tdsAmount: t.payments.tdsAmount,
        vdsAmount: t.payments.vdsAmount,
        accountName: t.accounts.name,
        status: t.payments.status,
      })
      .from(t.payments)
      .innerJoin(t.parties, eq(t.parties.id, t.payments.partyId))
      .innerJoin(t.accounts, eq(t.accounts.id, t.payments.cashAccountId))
      .where(where)
      .orderBy(desc(t.payments.date), desc(t.payments.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.payments)
      .innerJoin(t.parties, eq(t.parties.id, t.payments.partyId))
      .where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ pay: t.payments, partyName: t.parties.name, accountName: t.accounts.name })
      .from(t.payments)
      .innerJoin(t.parties, eq(t.parties.id, t.payments.partyId))
      .innerJoin(t.accounts, eq(t.accounts.id, t.payments.cashAccountId))
      .where(eq(t.payments.id, id));
    if (!row) throw new NotFoundException();
    const allocations = await db
      .select({
        id: t.paymentAllocations.id,
        amount: t.paymentAllocations.amount,
        invoiceId: t.paymentAllocations.invoiceId,
        billId: t.paymentAllocations.billId,
        invoiceNo: t.invoices.no,
        billNo: t.bills.no,
      })
      .from(t.paymentAllocations)
      .leftJoin(t.invoices, eq(t.invoices.id, t.paymentAllocations.invoiceId))
      .leftJoin(t.bills, eq(t.bills.id, t.paymentAllocations.billId))
      .where(eq(t.paymentAllocations.paymentId, id));
    return { ...row.pay, partyName: row.partyName, accountName: row.accountName, netAmount: m2(D(row.pay.amount).minus(row.pay.tdsAmount).minus(row.pay.vdsAmount)), allocations };
  }

  /** Open (unpaid) documents for a party, for the allocation UI. */
  async openDocuments(partyId: string, direction: 'in' | 'out') {
    const db = this.ctx.db;
    if (direction === 'in') {
      return db
        .select({ id: t.invoices.id, no: t.invoices.no, date: t.invoices.date, total: t.invoices.total, paid: t.invoices.paidAmount, outstanding: sql<string>`${t.invoices.total} - ${t.invoices.paidAmount}` })
        .from(t.invoices)
        .where(and(eq(t.invoices.partyId, partyId), inArray(t.invoices.status, ['posted', 'partially_paid'])))
        .orderBy(asc(t.invoices.date));
    }
    return db
      .select({ id: t.bills.id, no: t.bills.no, date: t.bills.date, total: t.bills.total, paid: t.bills.paidAmount, outstanding: sql<string>`${t.bills.total} - ${t.bills.paidAmount}` })
      .from(t.bills)
      .where(and(eq(t.bills.partyId, partyId), inArray(t.bills.status, ['posted', 'partially_paid'])))
      .orderBy(asc(t.bills.date));
  }

  /**
   * Payment out: Dr AP (gross)  Cr Bank (net)  Cr TDS payable  Cr VDS payable
   * Receipt in:  Dr Bank (net)  Dr AIT (TDS deducted by client)  Dr VAT current a/c (VDS)  Cr AR (gross)
   */
  async create(dto: PaymentDto) {
    const db = this.ctx.db;
    const id = await db.transaction(async (tx) => {
      const [acct] = await tx.select().from(t.accounts).where(eq(t.accounts.id, dto.cashAccountId));
      if (!acct || !['cash', 'bank'].includes(acct.subtype ?? '')) throw new BadRequestException('Select a cash or bank account');

      const taxIds = [dto.tdsCodeId, dto.vdsCodeId].filter((x): x is string => !!x);
      const taxes = taxIds.length ? await tx.select().from(t.taxCodes).where(inArray(t.taxCodes.id, taxIds)) : [];
      const rateOf = (id?: string | null, kind?: string) => {
        if (!id) return null;
        const tc = taxes.find((x) => x.id === id);
        if (!tc || tc.kind !== kind) throw new BadRequestException(`Invalid ${kind?.toUpperCase()} code`);
        return tc.rate;
      };
      const gross = D(dto.amount);
      const withheld = (codeId: string | null | undefined, kind: 'tds' | 'vds', override?: string | null) => {
        const rate = rateOf(codeId, kind);
        if (override != null) {
          if (!codeId) throw new BadRequestException(`Select a ${kind.toUpperCase()} code`);
          return D(override).toDecimalPlaces(2);
        }
        return rate ? pct(gross, rate) : new Decimal(0);
      };
      const tds = withheld(dto.tdsCodeId, 'tds', dto.tdsAmount);
      const vds = withheld(dto.vdsCodeId, 'vds', dto.vdsAmount);
      const net = gross.minus(tds).minus(vds);
      if (!net.isPositive()) throw new BadRequestException('Withholding exceeds payment amount');

      // Allocations
      const allocTotal = sum(dto.allocations.map((a) => a.amount));
      if (allocTotal.greaterThan(gross)) throw new BadRequestException('Allocated amount exceeds payment amount');
      for (const a of dto.allocations) {
        const table = dto.direction === 'in' ? t.invoices : t.bills;
        const docId = dto.direction === 'in' ? a.invoiceId : a.billId;
        if (!docId) throw new BadRequestException(dto.direction === 'in' ? 'Allocations must reference invoices' : 'Allocations must reference bills');
        const [doc] = await tx.select().from(table).where(eq(table.id, docId)).for('update');
        if (!doc || doc.partyId !== dto.partyId) throw new BadRequestException('Document does not belong to this party');
        if (!['posted', 'partially_paid'].includes(doc.status)) throw new BadRequestException(`${doc.no} is ${doc.status}`);
        const outstanding = D(doc.total).minus(doc.paidAmount);
        if (D(a.amount).greaterThan(outstanding)) throw new BadRequestException(`${doc.no}: only ${outstanding.toFixed(2)} outstanding`);
        const paid = D(doc.paidAmount).plus(a.amount);
        await tx
          .update(table)
          .set({ paidAmount: m2(paid), status: paid.equals(D(doc.total)) ? 'paid' : 'partially_paid' })
          .where(eq(table.id, docId));
      }

      const no = await this.numbering.next(tx, dto.direction === 'in' ? 'receipt' : 'payment', dto.date);
      const [pay] = await tx
        .insert(t.payments)
        .values({
          no,
          direction: dto.direction,
          partyId: dto.partyId,
          date: dto.date,
          cashAccountId: dto.cashAccountId,
          method: dto.method,
          chequeNo: dto.chequeNo,
          reference: dto.reference,
          amount: m2(gross),
          tdsCodeId: dto.tdsCodeId,
          tdsAmount: m2(tds),
          vdsCodeId: dto.vdsCodeId,
          vdsAmount: m2(vds),
          projectId: dto.projectId,
          notes: dto.notes,
          status: 'posted',
          createdBy: this.ctx.userId,
        })
        .returning({ id: t.payments.id });
      if (dto.allocations.length) {
        await tx.insert(t.paymentAllocations).values(
          dto.allocations.map((a) => ({ paymentId: pay.id, invoiceId: a.invoiceId, billId: a.billId, amount: m2(a.amount) })),
        );
      }

      const p = { partyId: dto.partyId, projectId: dto.projectId };
      const lines: PostLine[] =
        dto.direction === 'out'
          ? [
              { account: 'ap', debit: gross, ...p, description: `Payment ${no}` },
              { account: { id: dto.cashAccountId }, credit: net, ...p },
              { account: 'tds_payable', credit: tds, ...p, description: 'TDS deducted at source' },
              { account: 'vds_payable', credit: vds, ...p, description: 'VDS deducted at source' },
            ]
          : [
              { account: { id: dto.cashAccountId }, debit: net, ...p },
              { account: 'ait_receivable', debit: tds, ...p, description: 'AIT deducted by client' },
              { account: 'vat_input', debit: vds, ...p, description: 'VDS deducted by client' },
              { account: 'ar', credit: gross, ...p, description: `Receipt ${no}` },
            ];
      const entryId = await this.posting.post(tx, {
        date: dto.date,
        sourceType: 'payment',
        sourceId: pay.id,
        reference: dto.chequeNo ?? dto.reference ?? no,
        narration: `${dto.direction === 'in' ? 'Receipt from' : 'Payment to'} party (${dto.method})`,
        lines,
      });
      await tx.update(t.payments).set({ journalEntryId: entryId }).where(eq(t.payments.id, pay.id));
      return pay.id;
    });
    await this.audit.log('post', 'payment', id, null, dto);
    return this.get(id);
  }

  async cancel(id: string) {
    const pay = await this.get(id);
    if (pay.status !== 'posted') throw new BadRequestException(`Payment is ${pay.status}`);
    await this.ctx.db.transaction(async (tx) => {
      for (const a of pay.allocations) {
        const table = a.invoiceId ? t.invoices : t.bills;
        const docId = (a.invoiceId ?? a.billId)!;
        const [doc] = await tx.select().from(table).where(eq(table.id, docId)).for('update');
        const paid = D(doc.paidAmount).minus(a.amount);
        await tx
          .update(table)
          .set({ paidAmount: m2(paid), status: paid.isZero() ? 'posted' : 'partially_paid' })
          .where(eq(table.id, docId));
      }
      if (pay.journalEntryId) await this.posting.reverse(tx, pay.journalEntryId, new Date().toISOString().slice(0, 10));
      await tx.update(t.payments).set({ status: 'cancelled' }).where(eq(t.payments.id, id));
    });
    await this.audit.log('cancel', 'payment', id);
    return this.get(id);
  }
}
