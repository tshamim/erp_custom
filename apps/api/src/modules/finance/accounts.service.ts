import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import type { AccountDto, JournalEntryDto, ListQuery } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PostingService, normalizeLines } from '../../ledger/posting.service';
import { m2, sum } from '../../common/money';
import { searchClause } from '../../common/pagination';

@Injectable()
export class AccountsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  /** Flat list ordered by code, with posted balance (debit − credit) per account. */
  async list(asOf?: string) {
    const db = this.ctx.db;
    const bal = db
      .select({
        accountId: t.journalLines.accountId,
        debit: sql<string>`sum(${t.journalLines.debit})`.as('debit'),
        credit: sql<string>`sum(${t.journalLines.credit})`.as('credit'),
      })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .where(and(sql`${t.journalEntries.status} in ('posted','reversed')`, asOf ? lte(t.journalEntries.date, asOf) : undefined))
      .groupBy(t.journalLines.accountId)
      .as('bal');
    return db
      .select({
        id: t.accounts.id,
        code: t.accounts.code,
        name: t.accounts.name,
        type: t.accounts.type,
        subtype: t.accounts.subtype,
        parentId: t.accounts.parentId,
        isGroup: t.accounts.isGroup,
        isActive: t.accounts.isActive,
        debit: sql<string>`coalesce(${bal.debit}, 0)`,
        credit: sql<string>`coalesce(${bal.credit}, 0)`,
      })
      .from(t.accounts)
      .leftJoin(bal, eq(bal.accountId, t.accounts.id))
      .orderBy(asc(t.accounts.code));
  }

  private async validateParent(dto: Partial<AccountDto>) {
    if (!dto.parentId) return;
    const [parent] = await this.ctx.db.select().from(t.accounts).where(eq(t.accounts.id, dto.parentId));
    if (!parent) throw new BadRequestException('Parent account not found');
    if (!parent.isGroup) throw new BadRequestException('Parent must be a group account');
    if (dto.type && parent.type !== dto.type) throw new BadRequestException(`Parent is ${parent.type}; child must match`);
  }

  async create(dto: AccountDto) {
    await this.validateParent(dto);
    const [row] = await this.ctx.db.insert(t.accounts).values(dto).returning();
    await this.audit.log('create', 'account', row.id, null, row);
    return row;
  }

  async update(id: string, dto: Partial<AccountDto>) {
    const [before] = await this.ctx.db.select().from(t.accounts).where(eq(t.accounts.id, id));
    if (!before) throw new NotFoundException();
    await this.validateParent({ ...dto, type: dto.type ?? (before.type as AccountDto['type']) });
    if (dto.isGroup === true && !before.isGroup) {
      const [{ n }] = await this.ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(t.journalLines)
        .where(eq(t.journalLines.accountId, id));
      if (n) throw new BadRequestException('Account has postings; cannot convert to group');
    }
    const [row] = await this.ctx.db.update(t.accounts).set(dto).where(eq(t.accounts.id, id)).returning();
    await this.audit.log('update', 'account', id, before, row);
    return row;
  }

  mappings() {
    return this.ctx.db
      .select({ key: t.accountMappings.key, accountId: t.accountMappings.accountId, code: t.accounts.code, name: t.accounts.name })
      .from(t.accountMappings)
      .innerJoin(t.accounts, eq(t.accounts.id, t.accountMappings.accountId))
      .orderBy(asc(t.accountMappings.key));
  }

  async setMapping(key: string, accountId: string) {
    await this.ctx.db
      .insert(t.accountMappings)
      .values({ key, accountId })
      .onConflictDoUpdate({ target: t.accountMappings.key, set: { accountId } });
    await this.audit.log('update', 'account_mapping', key, null, { accountId });
    return this.mappings();
  }

  // ---------------- fiscal ----------------

  async fiscalYears() {
    const db = this.ctx.db;
    const years = await db.select().from(t.fiscalYears).orderBy(desc(t.fiscalYears.startDate));
    const periods = await db.select().from(t.fiscalPeriods).orderBy(asc(t.fiscalPeriods.startDate));
    return years.map((y) => ({ ...y, periods: periods.filter((p) => p.fiscalYearId === y.id) }));
  }

  /** Creates the fiscal year following the latest one (Jul–Jun) with 12 monthly periods. */
  async createNextFiscalYear() {
    const db = this.ctx.db;
    const [last] = await db.select().from(t.fiscalYears).orderBy(desc(t.fiscalYears.startDate)).limit(1);
    const startYear = last ? Number(last.endDate.slice(0, 4)) : new Date().getFullYear();
    const name = `FY${startYear}-${String(startYear + 1).slice(2)}`;
    return db.transaction(async (tx) => {
      const [fy] = await tx
        .insert(t.fiscalYears)
        .values({ name, startDate: `${startYear}-07-01`, endDate: `${startYear + 1}-06-30` })
        .returning();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      await tx.insert(t.fiscalPeriods).values(
        Array.from({ length: 12 }, (_, i) => {
          const s = new Date(Date.UTC(startYear, 6 + i, 1));
          const e = new Date(Date.UTC(startYear, 7 + i, 0));
          return { fiscalYearId: fy.id, name: iso(s).slice(0, 7), startDate: iso(s), endDate: iso(e) };
        }),
      );
      return fy;
    });
  }

  async setPeriodLock(id: string, isLocked: boolean) {
    const [row] = await this.ctx.db.update(t.fiscalPeriods).set({ isLocked }).where(eq(t.fiscalPeriods.id, id)).returning();
    if (!row) throw new NotFoundException();
    await this.audit.log(isLocked ? 'lock' : 'unlock', 'fiscal_period', id, null, row);
    return row;
  }
}

@Injectable()
export class JournalService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
  ) {}

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.journalEntries.no, t.journalEntries.narration, t.journalEntries.reference]),
      q.status ? eq(t.journalEntries.status, q.status) : undefined,
      q.type ? eq(t.journalEntries.sourceType, q.type) : undefined,
      q.from ? gte(t.journalEntries.date, q.from) : undefined,
      q.to ? lte(t.journalEntries.date, q.to) : undefined,
    );
    const data = await db
      .select()
      .from(t.journalEntries)
      .where(where)
      .orderBy(desc(t.journalEntries.date), desc(t.journalEntries.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.journalEntries).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const db = this.ctx.db;
    const [entry] = await db.select().from(t.journalEntries).where(eq(t.journalEntries.id, id));
    if (!entry) throw new NotFoundException();
    const lines = await db
      .select({
        line: t.journalLines,
        accountCode: t.accounts.code,
        accountName: t.accounts.name,
        partyName: t.parties.name,
        projectName: t.projects.name,
      })
      .from(t.journalLines)
      .innerJoin(t.accounts, eq(t.accounts.id, t.journalLines.accountId))
      .leftJoin(t.parties, eq(t.parties.id, t.journalLines.partyId))
      .leftJoin(t.projects, eq(t.projects.id, t.journalLines.projectId))
      .where(eq(t.journalLines.entryId, id))
      .orderBy(asc(t.journalLines.lineNo));
    return { ...entry, lines: lines.map((l) => ({ ...l.line, accountCode: l.accountCode, accountName: l.accountName, partyName: l.partyName, projectName: l.projectName })) };
  }

  /** Manual journal. `post=true` validates and posts immediately; otherwise saved as draft. */
  async create(dto: JournalEntryDto, post: boolean) {
    const db = this.ctx.db;
    const id = await db.transaction(async (tx) => {
      if (post) {
        return this.posting.post(tx, {
          date: dto.date,
          sourceType: 'manual',
          reference: dto.reference,
          narration: dto.narration,
          lines: dto.lines.map((l) => ({ ...l, account: { id: l.accountId } })),
        });
      }
      const no = await this.numbering.next(tx, 'journal', dto.date);
      const [e] = await tx
        .insert(t.journalEntries)
        .values({ no, date: dto.date, reference: dto.reference, narration: dto.narration, status: 'draft', createdBy: this.ctx.userId })
        .returning({ id: t.journalEntries.id });
      await tx.insert(t.journalLines).values(
        dto.lines.map((l, i) => ({
          entryId: e.id,
          lineNo: i + 1,
          accountId: l.accountId,
          debit: m2(l.debit),
          credit: m2(l.credit),
          partyId: l.partyId,
          projectId: l.projectId,
          departmentId: l.departmentId,
          description: l.description,
        })),
      );
      return e.id;
    });
    await this.audit.log(post ? 'post' : 'create', 'journal_entry', id, null, dto);
    return this.get(id);
  }

  async postDraft(id: string) {
    const db = this.ctx.db;
    await db.transaction(async (tx) => {
      const [entry] = await tx.select().from(t.journalEntries).where(eq(t.journalEntries.id, id)).for('update');
      if (!entry) throw new NotFoundException();
      if (entry.status !== 'draft') throw new BadRequestException(`Entry is ${entry.status}`);
      const lines = await tx.select().from(t.journalLines).where(eq(t.journalLines.entryId, id));
      const norm = normalizeLines(lines.map((l) => ({ account: { id: l.accountId }, debit: l.debit, credit: l.credit })));
      await this.posting.assertOpenPeriod(tx, entry.date);
      await this.posting.resolveAccounts(tx, norm);
      const total = sum(norm.map((l) => l.debit));
      await tx
        .update(t.journalEntries)
        .set({ status: 'posted', totalDebit: m2(total), totalCredit: m2(total), postedAt: new Date(), postedBy: this.ctx.userId })
        .where(eq(t.journalEntries.id, id));
    });
    await this.audit.log('post', 'journal_entry', id);
    return this.get(id);
  }

  async deleteDraft(id: string) {
    const [entry] = await this.ctx.db.select().from(t.journalEntries).where(eq(t.journalEntries.id, id));
    if (!entry) throw new NotFoundException();
    if (entry.status !== 'draft') throw new BadRequestException('Only drafts can be deleted; reverse posted entries instead');
    await this.ctx.db.delete(t.journalEntries).where(eq(t.journalEntries.id, id));
    await this.audit.log('delete', 'journal_entry', id, entry, null);
    return { ok: true };
  }

  async reverse(id: string, date?: string) {
    const [entry] = await this.ctx.db.select().from(t.journalEntries).where(eq(t.journalEntries.id, id));
    if (!entry) throw new NotFoundException();
    if (entry.sourceType !== 'manual') {
      throw new BadRequestException(`This entry was generated by ${entry.sourceType}; cancel the source document instead`);
    }
    const newId = await this.ctx.db.transaction((tx) => this.posting.reverse(tx, id, date ?? new Date().toISOString().slice(0, 10)));
    await this.audit.log('reverse', 'journal_entry', id, null, { reversal: newId });
    return this.get(newId);
  }
}
