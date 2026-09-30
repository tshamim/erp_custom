import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import type { ListQuery, QuotationDto, QuotationWinDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { D, m2, pct, q4, sum } from '../../common/money';
import { searchClause } from '../../common/pagination';
import { MailService } from '../../mail/mail.service';
import { quotationSent } from '../../mail/templates';

/** Quotation totals. Pure: subtotal of priced lines, less discount, plus VAT. */
export function computeQuotation(lines: { quantity: string; rate: string; isSection: boolean }[], discount: string, vatPercent: string) {
  const amounts = lines.map((l) => (l.isSection ? D(0) : D(l.quantity).times(l.rate).toDecimalPlaces(2)));
  const subtotal = sum(amounts);
  const net = subtotal.minus(D(discount));
  if (net.isNegative()) throw new BadRequestException('Discount is larger than the quotation total');
  const vat = pct(net, vatPercent);
  return { amounts, subtotal, vat, total: net.plus(vat) };
}

@Injectable()
export class QuotationsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly mail: MailService,
  ) {}

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.quotations.no, t.quotations.title, t.quotations.projectCode]),
      q.status ? eq(t.quotations.status, q.status) : undefined,
      q.partyId ? eq(t.quotations.clientId, q.partyId) : undefined,
    );
    const data = await db
      .select({
        id: t.quotations.id,
        no: t.quotations.no,
        date: t.quotations.date,
        validUntil: t.quotations.validUntil,
        title: t.quotations.title,
        clientName: t.parties.name,
        subtotal: t.quotations.subtotal,
        total: t.quotations.total,
        status: t.quotations.status,
        wonProjectId: t.quotations.wonProjectId,
        projectCode: t.projects.code,
      })
      .from(t.quotations)
      .leftJoin(t.parties, eq(t.parties.id, t.quotations.clientId))
      .leftJoin(t.projects, eq(t.projects.id, t.quotations.wonProjectId))
      .where(where)
      .orderBy(desc(t.quotations.date), desc(t.quotations.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.quotations).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ q: t.quotations, clientName: t.parties.name, clientAddress: t.parties.address, projectCodeWon: t.projects.code })
      .from(t.quotations)
      .leftJoin(t.parties, eq(t.parties.id, t.quotations.clientId))
      .leftJoin(t.projects, eq(t.projects.id, t.quotations.wonProjectId))
      .where(eq(t.quotations.id, id));
    if (!row) throw new NotFoundException();
    const lines = await db.select().from(t.quotationLines).where(eq(t.quotationLines.quotationId, id)).orderBy(asc(t.quotationLines.sortOrder), asc(t.quotationLines.lineNo));
    return { ...row.q, clientName: row.clientName, clientAddress: row.clientAddress, projectCodeWon: row.projectCodeWon, lines };
  }

  async create(dto: QuotationDto) {
    const c = computeQuotation(dto.lines, dto.discount, dto.vatPercent);
    const id = await this.ctx.db.transaction(async (tx) => {
      const no = await this.numbering.next(tx, 'quotation', dto.date);
      const [row] = await tx
        .insert(t.quotations)
        .values({
          no,
          date: dto.date,
          validUntil: dto.validUntil,
          clientId: dto.clientId,
          title: dto.title,
          location: dto.location,
          projectCode: dto.projectCode,
          subtotal: m2(c.subtotal),
          discount: m2(dto.discount),
          vatPercent: dto.vatPercent,
          vatAmount: m2(c.vat),
          total: m2(c.total),
          retentionPercent: dto.retentionPercent,
          notes: dto.notes,
          terms: dto.terms,
          createdBy: this.ctx.userId,
        })
        .returning({ id: t.quotations.id });
      await tx.insert(t.quotationLines).values(
        dto.lines.map((l, i) => ({
          quotationId: row.id,
          lineNo: l.lineNo,
          description: l.description,
          uom: l.uom,
          quantity: q4(l.quantity),
          rate: m2(l.rate),
          amount: m2(c.amounts[i]),
          isSection: l.isSection,
          sortOrder: String(i + 1).padStart(4, '0'),
        })),
      );
      return row.id;
    });
    await this.audit.log('create', 'quotation', id, null, dto);
    return this.get(id);
  }

  async update(id: string, dto: QuotationDto) {
    const before = await this.get(id);
    if (before.status === 'won') throw new BadRequestException('A won quotation cannot be edited — it has become a project');
    const c = computeQuotation(dto.lines, dto.discount, dto.vatPercent);
    await this.ctx.db.transaction(async (tx) => {
      await tx
        .update(t.quotations)
        .set({
          date: dto.date,
          validUntil: dto.validUntil,
          clientId: dto.clientId,
          title: dto.title,
          location: dto.location,
          projectCode: dto.projectCode,
          subtotal: m2(c.subtotal),
          discount: m2(dto.discount),
          vatPercent: dto.vatPercent,
          vatAmount: m2(c.vat),
          total: m2(c.total),
          retentionPercent: dto.retentionPercent,
          notes: dto.notes,
          terms: dto.terms,
        })
        .where(eq(t.quotations.id, id));
      await tx.delete(t.quotationLines).where(eq(t.quotationLines.quotationId, id));
      await tx.insert(t.quotationLines).values(
        dto.lines.map((l, i) => ({
          quotationId: id,
          lineNo: l.lineNo,
          description: l.description,
          uom: l.uom,
          quantity: q4(l.quantity),
          rate: m2(l.rate),
          amount: m2(c.amounts[i]),
          isSection: l.isSection,
          sortOrder: String(i + 1).padStart(4, '0'),
        })),
      );
    });
    await this.audit.log('update', 'quotation', id, before, dto);
    return this.get(id);
  }

  async setStatus(id: string, status: 'sent' | 'lost' | 'expired' | 'cancelled', reason?: string | null) {
    const quotation = await this.get(id);
    if (quotation.status === 'won') throw new BadRequestException('This quotation has been won and converted to a project');
    const [row] = await this.ctx.db
      .update(t.quotations)
      .set({ status, lostReason: status === 'lost' ? reason : null })
      .where(eq(t.quotations.id, id))
      .returning();
    await this.audit.log(status, 'quotation', id, { status: quotation.status }, { status, reason });
    if (status === 'sent') void this.mailToClient(quotation);
    return row;
  }

  /** Emails the client the offer as soon as it is marked sent, if they have an email on file. */
  private async mailToClient(quotation: Awaited<ReturnType<QuotationsService['get']>>) {
    if (!quotation.clientId) return;
    const [client] = await this.ctx.db.select({ name: t.parties.name, email: t.parties.email }).from(t.parties).where(eq(t.parties.id, quotation.clientId));
    if (!client?.email) return;
    const [sender] = this.ctx.userId
      ? await this.ctx.db.select({ email: t.users.email }).from(t.users).where(eq(t.users.id, this.ctx.userId))
      : [undefined];
    await this.mail.send({
      to: { email: client.email, name: client.name },
      replyTo: sender?.email,
      ...quotationSent({
        company: this.ctx.tenant.name,
        clientName: client.name,
        no: quotation.no,
        title: quotation.title,
        date: quotation.date,
        validUntil: quotation.validUntil,
        subtotal: quotation.subtotal,
        vatAmount: quotation.vatAmount,
        total: quotation.total,
        contact: sender?.email,
      }),
    });
  }

  /**
   * Winning a quotation creates the project and copies the quoted lines into its BOQ,
   * so nothing is re-typed. The quotation is then locked.
   */
  async win(id: string, dto: QuotationWinDto) {
    const quotation = await this.get(id);
    if (quotation.status === 'won') throw new BadRequestException('Already converted to a project');
    if (quotation.status === 'cancelled') throw new BadRequestException('Cancelled quotations cannot be won');
    if (!quotation.clientId) throw new BadRequestException('Set the client on the quotation first');
    if (!quotation.lines.some((l) => !l.isSection)) throw new BadRequestException('The quotation has no priced lines to copy into the BOQ');

    const projectId = await this.ctx.db.transaction(async (tx) => {
      const [clash] = await tx.select({ id: t.projects.id }).from(t.projects).where(eq(t.projects.code, dto.projectCode));
      if (clash) throw new BadRequestException(`Project code ${dto.projectCode} is already used`);
      const [project] = await tx
        .insert(t.projects)
        .values({
          code: dto.projectCode,
          name: quotation.title,
          clientId: quotation.clientId,
          contractNo: quotation.no,
          // The contract is the work, before VAT; VAT is added again on each RA bill.
          contractValue: m2(D(quotation.subtotal).minus(quotation.discount)),
          location: quotation.location,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status: 'active',
          projectManagerId: dto.projectManagerId,
          retentionPercent: quotation.retentionPercent,
          vatPercent: quotation.vatPercent,
          mobilizationAdvance: m2(dto.mobilizationAdvance),
          advanceRecoveryPercent: dto.advanceRecoveryPercent,
          description: `Created from quotation ${quotation.no}`,
        })
        .returning({ id: t.projects.id });

      await tx.insert(t.boqItems).values(
        quotation.lines.map((l, i) => ({
          projectId: project.id,
          code: l.lineNo,
          description: l.description,
          uom: l.uom,
          quantity: l.isSection ? '0' : l.quantity,
          rate: l.isSection ? '0' : l.rate,
          amount: l.isSection ? '0' : l.amount,
          isSection: l.isSection,
          sortOrder: i + 1,
        })),
      );

      if (dto.createSiteStore) {
        await tx.insert(t.warehouses).values({
          code: `S-${dto.projectCode}`.slice(0, 20),
          name: `${quotation.title} - Site Store`,
          type: 'site',
          projectId: project.id,
          address: quotation.location,
        });
      }

      await tx.update(t.quotations).set({ status: 'won', wonProjectId: project.id, lostReason: null }).where(eq(t.quotations.id, id));
      return project.id;
    });

    await this.audit.log('win', 'quotation', id, null, { projectId, projectCode: dto.projectCode });
    return { quotation: await this.get(id), projectId };
  }
}
