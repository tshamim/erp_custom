import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import type { CompanyDocumentDto, ListQuery } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { searchClause } from '../../common/pagination';
import { MailService } from '../../mail/mail.service';
import { expiringDocuments } from '../../mail/templates';

const today = () => new Date().toISOString().slice(0, 10);
const in30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

/** Company paperwork with expiry tracking, and a gallery over everything uploaded as an image. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private state(expiry: string | null) {
    if (!expiry) return 'valid';
    if (expiry < today()) return 'expired';
    return expiry <= in30() ? 'expiring' : 'valid';
  }

  async list(q: ListQuery & { category?: string }) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.companyDocuments.title, t.companyDocuments.docNo, t.companyDocuments.issuedBy]),
      q.category ? eq(t.companyDocuments.category, q.category) : undefined,
      q.projectId ? eq(t.companyDocuments.projectId, q.projectId) : undefined,
    );
    const data = await db
      .select({
        id: t.companyDocuments.id,
        category: t.companyDocuments.category,
        title: t.companyDocuments.title,
        docNo: t.companyDocuments.docNo,
        issuedBy: t.companyDocuments.issuedBy,
        issueDate: t.companyDocuments.issueDate,
        expiryDate: t.companyDocuments.expiryDate,
        isConfidential: t.companyDocuments.isConfidential,
        remarks: t.companyDocuments.remarks,
        projectName: t.projects.name,
        files: sql<number>`(select count(*)::int from attachments a where a.entity = 'company_document' and a.entity_id = company_documents.id)`,
      })
      .from(t.companyDocuments)
      .leftJoin(t.projects, eq(t.projects.id, t.companyDocuments.projectId))
      .where(where)
      .orderBy(asc(t.companyDocuments.expiryDate), asc(t.companyDocuments.title))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.companyDocuments).where(where);
    return { data: data.map((d) => ({ ...d, state: this.state(d.expiryDate) })), total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const [row] = await this.ctx.db.select().from(t.companyDocuments).where(eq(t.companyDocuments.id, id));
    if (!row) throw new NotFoundException();
    return { ...row, state: this.state(row.expiryDate) };
  }

  async create(dto: CompanyDocumentDto) {
    const [row] = await this.ctx.db.insert(t.companyDocuments).values({ ...dto, createdBy: this.ctx.userId }).returning();
    await this.audit.log('create', 'company_document', row.id, null, row);
    return row;
  }

  async update(id: string, dto: Partial<CompanyDocumentDto>) {
    const before = await this.get(id);
    const [row] = await this.ctx.db.update(t.companyDocuments).set(dto).where(eq(t.companyDocuments.id, id)).returning();
    await this.audit.log('update', 'company_document', id, before, row);
    return row;
  }

  async remove(id: string) {
    const before = await this.get(id);
    await this.ctx.db.delete(t.companyDocuments).where(eq(t.companyDocuments.id, id));
    await this.audit.log('delete', 'company_document', id, before, null);
    return { ok: true };
  }

  /** Company papers already expired or expiring within 30 days. */
  async expiring() {
    const rows = await this.ctx.db
      .select({ d: t.companyDocuments, projectName: t.projects.name })
      .from(t.companyDocuments)
      .leftJoin(t.projects, eq(t.projects.id, t.companyDocuments.projectId))
      .where(lte(t.companyDocuments.expiryDate, in30()))
      .orderBy(asc(t.companyDocuments.expiryDate));
    return rows.map((r) => ({
      ...r.d,
      projectName: r.projectName,
      state: this.state(r.d.expiryDate),
      daysLeft: Math.round((Date.parse(r.d.expiryDate!) - Date.parse(today())) / 86_400_000),
    }));
  }

  /**
   * Emails the expiring-document list to the company's administrators (or to the addresses
   * asked for). Run it from the register, or on a schedule from outside the application.
   */
  async emailExpiring(to?: string[]) {
    const documents = await this.expiring();
    if (!documents.length) return { sent: 0, documents: 0, recipients: [] as string[] };

    const admins = to?.length
      ? to.map((email) => ({ email, name: email }))
      : await this.ctx.db
          .selectDistinct({ email: t.users.email, name: t.users.name })
          .from(t.users)
          .innerJoin(t.userRoles, eq(t.userRoles.userId, t.users.id))
          .innerJoin(t.roles, eq(t.roles.id, t.userRoles.roleId))
          .where(and(eq(t.users.isActive, true), eq(t.roles.name, 'Admin')));
    if (!admins.length) return { sent: 0, documents: documents.length, recipients: [] };

    await this.mail.sendEach(admins, (recipient) =>
      expiringDocuments({
        company: this.ctx.tenant.name,
        slug: this.ctx.tenant.slug,
        name: recipient.name ?? 'Colleague',
        documents: documents.map((d) => ({ title: d.title, docNo: d.docNo, expiryDate: d.expiryDate, daysLeft: d.daysLeft })),
      }),
    );
    await this.audit.log('notify', 'company_document', null, null, { documents: documents.length, recipients: admins.map((a) => a.email) });
    return { sent: admins.length, documents: documents.length, recipients: admins.map((a) => a.email) };
  }

  /**
   * Every image uploaded anywhere in the system, newest first — site photographs, scanned
   * certificates, signed challans. Filter by the record they are attached to.
   */
  async gallery(q: { entity?: string; entityId?: string; limit?: number }) {
    return this.ctx.db
      .select({
        id: t.attachments.id,
        fileName: t.attachments.fileName,
        mimeType: t.attachments.mimeType,
        size: t.attachments.size,
        entity: t.attachments.entity,
        entityId: t.attachments.entityId,
        createdAt: t.attachments.createdAt,
        uploadedBy: t.users.name,
      })
      .from(t.attachments)
      .leftJoin(t.users, eq(t.users.id, t.attachments.uploadedBy))
      .where(
        and(
          sql`${t.attachments.mimeType} like 'image/%'`,
          q.entity ? eq(t.attachments.entity, q.entity) : undefined,
          q.entityId ? eq(t.attachments.entityId, q.entityId) : undefined,
        ),
      )
      .orderBy(desc(t.attachments.createdAt))
      .limit(Math.min(q.limit ?? 100, 500));
  }
}
