import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import { EB3_STAGE_LIST as EB3_STAGES } from '@erp/shared';
import type { Eb3CandidateDto, Eb3CaseDocumentDto, Eb3CaseDto, Eb3EmployerDto, Eb3JobOrderDto, Eb3PaymentDto, Eb3StageDto, ListQuery } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PostingService } from '../../ledger/posting.service';
import { D, Decimal, m2 } from '../../common/money';
import { searchClause } from '../../common/pagination';
import { MailService } from '../../mail/mail.service';
import { eb3CaseUpdate } from '../../mail/templates';

/** The checklist every new case starts with; officers add or remove rows afterwards. */
const DEFAULT_CHECKLIST = [
  'Passport copy',
  'Birth certificate',
  'National ID',
  'Educational certificates',
  'Experience letters',
  'Police clearance',
  'Medical examination',
  'Photographs (2x2)',
  'Signed service agreement',
];

/** Milestones worth telling the candidate about; the rest are internal paperwork. */
const MAILED_STAGES = new Set(['perm_approved', 'i140_approved', 'nvc_processing', 'interview_scheduled', 'visa_approved', 'visa_denied', 'departed']);

/** Stage index, used to keep `stage` at the furthest point reached. */
export function stageIndex(stage: string) {
  return EB3_STAGES.indexOf(stage as (typeof EB3_STAGES)[number]);
}

/** A stage change also moves the candidate along their own funnel. */
export function candidateStatusFor(stage: string): string | null {
  if (stage === 'departed') return 'departed';
  if (stage === 'visa_approved') return 'visa_issued';
  if (stage === 'visa_denied') return 'rejected';
  return null;
}

/**
 * EB-3 case administration for a recruitment agency: employers, job orders, candidates,
 * and the case that joins a candidate to a job order and walks the statutory stages.
 */
@Injectable()
export class Eb3Service {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
    private readonly mail: MailService,
  ) {}

  // ---------- employers ----------

  async employers(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.eb3Employers.code, t.eb3Employers.name, t.eb3Employers.city]),
      q.status ? eq(t.eb3Employers.status, q.status) : undefined,
    );
    const data = await db
      .select({
        id: t.eb3Employers.id,
        code: t.eb3Employers.code,
        name: t.eb3Employers.name,
        contactPerson: t.eb3Employers.contactPerson,
        email: t.eb3Employers.email,
        phone: t.eb3Employers.phone,
        city: t.eb3Employers.city,
        state: t.eb3Employers.state,
        industry: t.eb3Employers.industry,
        status: t.eb3Employers.status,
        openJobOrders: sql<number>`(select count(*)::int from eb3_job_orders j where j.employer_id = eb3_employers.id and j.status = 'open')`,
        openPositions: sql<number>`coalesce((select sum(j.positions - j.filled_positions)::int from eb3_job_orders j
          where j.employer_id = eb3_employers.id and j.status = 'open'), 0)`,
        activeCases: sql<number>`(select count(*)::int from eb3_cases c where c.employer_id = eb3_employers.id and c.status = 'active')`,
      })
      .from(t.eb3Employers)
      .where(where)
      .orderBy(asc(t.eb3Employers.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.eb3Employers).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async employer(id: string) {
    const [row] = await this.ctx.db.select().from(t.eb3Employers).where(eq(t.eb3Employers.id, id));
    if (!row) throw new NotFoundException();
    return row;
  }

  async createEmployer(dto: Eb3EmployerDto) {
    const [row] = await this.ctx.db.insert(t.eb3Employers).values(dto).returning();
    await this.audit.log('create', 'eb3_employer', row.id, null, row);
    return row;
  }

  async updateEmployer(id: string, dto: Partial<Eb3EmployerDto>) {
    const [before] = await this.ctx.db.select().from(t.eb3Employers).where(eq(t.eb3Employers.id, id));
    if (!before) throw new NotFoundException();
    const [row] = await this.ctx.db.update(t.eb3Employers).set(dto).where(eq(t.eb3Employers.id, id)).returning();
    await this.audit.log('update', 'eb3_employer', id, before, row);
    return row;
  }

  // ---------- job orders ----------

  async jobOrders(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.eb3JobOrders.no, t.eb3JobOrders.title, t.eb3JobOrders.socCode]),
      q.status ? eq(t.eb3JobOrders.status, q.status) : undefined,
    );
    const data = await db
      .select({
        id: t.eb3JobOrders.id,
        no: t.eb3JobOrders.no,
        title: t.eb3JobOrders.title,
        employerName: t.eb3Employers.name,
        employerId: t.eb3JobOrders.employerId,
        socCode: t.eb3JobOrders.socCode,
        positions: t.eb3JobOrders.positions,
        filledPositions: t.eb3JobOrders.filledPositions,
        offeredWage: t.eb3JobOrders.offeredWage,
        wageUnit: t.eb3JobOrders.wageUnit,
        worksiteCity: t.eb3JobOrders.worksiteCity,
        worksiteState: t.eb3JobOrders.worksiteState,
        openedDate: t.eb3JobOrders.openedDate,
        status: t.eb3JobOrders.status,
      })
      .from(t.eb3JobOrders)
      .innerJoin(t.eb3Employers, eq(t.eb3Employers.id, t.eb3JobOrders.employerId))
      .where(where)
      .orderBy(desc(t.eb3JobOrders.openedDate), desc(t.eb3JobOrders.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.eb3JobOrders).where(where);
    return { data: data.map((r) => ({ ...r, vacancies: r.positions - r.filledPositions })), total: count, page: q.page, pageSize: q.pageSize };
  }

  async jobOrder(id: string) {
    const [row] = await this.ctx.db.select().from(t.eb3JobOrders).where(eq(t.eb3JobOrders.id, id));
    if (!row) throw new NotFoundException();
    return row;
  }

  async createJobOrder(dto: Eb3JobOrderDto) {
    const row = await this.ctx.db.transaction(async (tx) => {
      const no = await this.numbering.next(tx, 'eb3_job_order', dto.openedDate ?? undefined);
      const [r] = await tx
        .insert(t.eb3JobOrders)
        .values({ ...dto, no, offeredWage: dto.offeredWage ? m2(dto.offeredWage) : null })
        .returning();
      return r;
    });
    await this.audit.log('create', 'eb3_job_order', row.id, null, row);
    return row;
  }

  async updateJobOrder(id: string, dto: Partial<Eb3JobOrderDto>) {
    const [before] = await this.ctx.db.select().from(t.eb3JobOrders).where(eq(t.eb3JobOrders.id, id));
    if (!before) throw new NotFoundException();
    if (dto.positions != null && dto.positions < before.filledPositions) {
      throw new BadRequestException(`${before.filledPositions} position(s) are already filled on this job order`);
    }
    const [row] = await this.ctx.db
      .update(t.eb3JobOrders)
      .set({ ...dto, offeredWage: dto.offeredWage ? m2(dto.offeredWage) : undefined })
      .where(eq(t.eb3JobOrders.id, id))
      .returning();
    await this.audit.log('update', 'eb3_job_order', id, before, row);
    return row;
  }

  // ---------- candidates ----------

  async candidates(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.eb3Candidates.code, t.eb3Candidates.fullName, t.eb3Candidates.passportNo, t.eb3Candidates.phone]),
      q.status ? eq(t.eb3Candidates.status, q.status) : undefined,
      q.type ? eq(t.eb3Candidates.skill, q.type) : undefined,
    );
    const data = await db
      .select({
        id: t.eb3Candidates.id,
        code: t.eb3Candidates.code,
        fullName: t.eb3Candidates.fullName,
        phone: t.eb3Candidates.phone,
        email: t.eb3Candidates.email,
        district: t.eb3Candidates.district,
        passportNo: t.eb3Candidates.passportNo,
        passportExpiry: t.eb3Candidates.passportExpiry,
        skill: t.eb3Candidates.skill,
        englishLevel: t.eb3Candidates.englishLevel,
        status: t.eb3Candidates.status,
        caseNo: sql<string | null>`(select c.no from eb3_cases c where c.candidate_id = eb3_candidates.id order by c.created_at desc limit 1)`,
        caseStage: sql<string | null>`(select c.stage from eb3_cases c where c.candidate_id = eb3_candidates.id order by c.created_at desc limit 1)`,
        paidIn: sql<string>`coalesce((select sum(case when p.direction = 'in' then p.amount else -p.amount end) from eb3_payments p
          where p.candidate_id = eb3_candidates.id and p.status = 'posted'), 0)`,
      })
      .from(t.eb3Candidates)
      .where(where)
      .orderBy(asc(t.eb3Candidates.fullName))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.eb3Candidates).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async candidate(id: string) {
    const db = this.ctx.db;
    const [row] = await db.select().from(t.eb3Candidates).where(eq(t.eb3Candidates.id, id));
    if (!row) throw new NotFoundException();
    const cases = await db
      .select({ c: t.eb3Cases, employerName: t.eb3Employers.name, jobTitle: t.eb3JobOrders.title })
      .from(t.eb3Cases)
      .innerJoin(t.eb3Employers, eq(t.eb3Employers.id, t.eb3Cases.employerId))
      .leftJoin(t.eb3JobOrders, eq(t.eb3JobOrders.id, t.eb3Cases.jobOrderId))
      .where(eq(t.eb3Cases.candidateId, id))
      .orderBy(desc(t.eb3Cases.openedDate));
    const payments = await db
      .select()
      .from(t.eb3Payments)
      .where(eq(t.eb3Payments.candidateId, id))
      .orderBy(asc(t.eb3Payments.date));
    const received = payments.filter((p) => p.status === 'posted' && p.direction === 'in').reduce((a, p) => a.plus(p.amount), new Decimal(0));
    const spent = payments.filter((p) => p.status === 'posted' && p.direction === 'out').reduce((a, p) => a.plus(p.amount), new Decimal(0));
    const agreedFee = cases.reduce((a, r) => a.plus(r.c.agreedFee), new Decimal(0));
    return {
      ...row,
      cases: cases.map((r) => ({ ...r.c, employerName: r.employerName, jobTitle: r.jobTitle })),
      payments,
      money: { agreedFee: m2(agreedFee), received: m2(received), spentOnBehalf: m2(spent), dueFromCandidate: m2(agreedFee.minus(received)) },
    };
  }

  async createCandidate(dto: Eb3CandidateDto) {
    const row = await this.ctx.db.transaction(async (tx) => {
      const code = dto.code || (await this.numbering.next(tx, 'eb3_candidate'));
      const [r] = await tx.insert(t.eb3Candidates).values({ ...dto, code }).returning();
      return r;
    });
    await this.audit.log('create', 'eb3_candidate', row.id, null, row);
    return row;
  }

  async updateCandidate(id: string, dto: Partial<Eb3CandidateDto>) {
    const [before] = await this.ctx.db.select().from(t.eb3Candidates).where(eq(t.eb3Candidates.id, id));
    if (!before) throw new NotFoundException();
    const [row] = await this.ctx.db.update(t.eb3Candidates).set(dto).where(eq(t.eb3Candidates.id, id)).returning();
    await this.audit.log('update', 'eb3_candidate', id, before, row);
    return row;
  }

  // ---------- cases ----------

  async cases(q: ListQuery & { employerId?: string; stage?: string }) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.eb3Cases.no, t.eb3Cases.permCaseNo, t.eb3Cases.i140Receipt, t.eb3Cases.nvcCaseNo]),
      q.status ? eq(t.eb3Cases.status, q.status) : undefined,
      q.stage ? eq(t.eb3Cases.stage, q.stage) : undefined,
      q.employerId ? eq(t.eb3Cases.employerId, q.employerId) : undefined,
    );
    const data = await db
      .select({
        id: t.eb3Cases.id,
        no: t.eb3Cases.no,
        candidateId: t.eb3Cases.candidateId,
        candidateName: t.eb3Candidates.fullName,
        passportNo: t.eb3Candidates.passportNo,
        employerName: t.eb3Employers.name,
        jobTitle: t.eb3JobOrders.title,
        stage: t.eb3Cases.stage,
        stageDate: t.eb3Cases.stageDate,
        openedDate: t.eb3Cases.openedDate,
        priorityDate: t.eb3Cases.priorityDate,
        interviewDate: t.eb3Cases.interviewDate,
        status: t.eb3Cases.status,
        agreedFee: t.eb3Cases.agreedFee,
        collected: sql<string>`coalesce((select sum(p.amount) from eb3_payments p
          where p.case_id = eb3_cases.id and p.status = 'posted' and p.direction = 'in'), 0)`,
        docsPending: sql<number>`(select count(*)::int from eb3_case_documents d
          where d.case_id = eb3_cases.id and d.required = true and d.received_date is null)`,
      })
      .from(t.eb3Cases)
      .innerJoin(t.eb3Candidates, eq(t.eb3Candidates.id, t.eb3Cases.candidateId))
      .innerJoin(t.eb3Employers, eq(t.eb3Employers.id, t.eb3Cases.employerId))
      .leftJoin(t.eb3JobOrders, eq(t.eb3JobOrders.id, t.eb3Cases.jobOrderId))
      .where(where)
      .orderBy(desc(t.eb3Cases.openedDate), desc(t.eb3Cases.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.eb3Cases).where(where);
    return {
      data: data.map((r) => ({ ...r, due: m2(D(r.agreedFee).minus(r.collected)) })),
      total: count,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** How many live cases sit at each stage — the pipeline board. */
  async pipeline() {
    const rows = await this.ctx.db
      .select({ stage: t.eb3Cases.stage, count: sql<number>`count(*)::int`, fee: sql<string>`coalesce(sum(${t.eb3Cases.agreedFee}), 0)` })
      .from(t.eb3Cases)
      .where(eq(t.eb3Cases.status, 'active'))
      .groupBy(t.eb3Cases.stage);
    const byStage = new Map(rows.map((r) => [r.stage, r]));
    return EB3_STAGES.map((stage) => ({
      stage,
      count: byStage.get(stage)?.count ?? 0,
      agreedFee: m2(byStage.get(stage)?.fee ?? 0),
    }));
  }

  async case(id: string) {
    const db = this.ctx.db;
    const [row] = await db
      .select({ c: t.eb3Cases, candidate: t.eb3Candidates, employerName: t.eb3Employers.name, jobTitle: t.eb3JobOrders.title, jobNo: t.eb3JobOrders.no })
      .from(t.eb3Cases)
      .innerJoin(t.eb3Candidates, eq(t.eb3Candidates.id, t.eb3Cases.candidateId))
      .innerJoin(t.eb3Employers, eq(t.eb3Employers.id, t.eb3Cases.employerId))
      .leftJoin(t.eb3JobOrders, eq(t.eb3JobOrders.id, t.eb3Cases.jobOrderId))
      .where(eq(t.eb3Cases.id, id));
    if (!row) throw new NotFoundException();
    const events = await db.select().from(t.eb3CaseEvents).where(eq(t.eb3CaseEvents.caseId, id)).orderBy(asc(t.eb3CaseEvents.date), asc(t.eb3CaseEvents.createdAt));
    const documents = await db.select().from(t.eb3CaseDocuments).where(eq(t.eb3CaseDocuments.caseId, id)).orderBy(asc(t.eb3CaseDocuments.docType));
    const payments = await db.select().from(t.eb3Payments).where(eq(t.eb3Payments.caseId, id)).orderBy(asc(t.eb3Payments.date));
    const collected = payments.filter((p) => p.status === 'posted' && p.direction === 'in').reduce((a, p) => a.plus(p.amount), new Decimal(0));
    const spent = payments.filter((p) => p.status === 'posted' && p.direction === 'out').reduce((a, p) => a.plus(p.amount), new Decimal(0));
    return {
      ...row.c,
      candidate: row.candidate,
      employerName: row.employerName,
      jobTitle: row.jobTitle,
      jobNo: row.jobNo,
      stageIndex: stageIndex(row.c.stage),
      stages: EB3_STAGES,
      events,
      documents,
      payments,
      money: {
        agreedFee: row.c.agreedFee,
        collected: m2(collected),
        due: m2(D(row.c.agreedFee).minus(collected)),
        spentOnBehalf: m2(spent),
      },
    };
  }

  /**
   * Opens a case for a candidate against a job order. One live case per candidate, and the
   * job order's filled count moves with it so vacancies stay honest.
   */
  async createCase(dto: Eb3CaseDto) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const [candidate] = await tx.select().from(t.eb3Candidates).where(eq(t.eb3Candidates.id, dto.candidateId));
      if (!candidate) throw new NotFoundException('Candidate not found');
      const [live] = await tx
        .select({ no: t.eb3Cases.no })
        .from(t.eb3Cases)
        .where(and(eq(t.eb3Cases.candidateId, dto.candidateId), sql`${t.eb3Cases.status} in ('active','on_hold')`));
      if (live) throw new BadRequestException(`${candidate.fullName} already has a live case (${live.no})`);

      if (dto.jobOrderId) {
        const [job] = await tx.select().from(t.eb3JobOrders).where(eq(t.eb3JobOrders.id, dto.jobOrderId));
        if (!job) throw new NotFoundException('Job order not found');
        if (job.status !== 'open') throw new BadRequestException('That job order is not open');
        if (job.filledPositions >= job.positions) throw new BadRequestException('That job order has no vacancy left');
        const filled = job.filledPositions + 1;
        await tx
          .update(t.eb3JobOrders)
          .set({ filledPositions: filled, status: filled >= job.positions ? 'filled' : job.status })
          .where(eq(t.eb3JobOrders.id, dto.jobOrderId));
      }

      const no = await this.numbering.next(tx, 'eb3_case', dto.openedDate);
      const [row] = await tx
        .insert(t.eb3Cases)
        .values({ ...dto, no, agreedFee: m2(dto.agreedFee), stage: 'prevailing_wage', stageDate: dto.openedDate, createdBy: this.ctx.userId })
        .returning({ id: t.eb3Cases.id });
      await tx.insert(t.eb3CaseEvents).values({
        caseId: row.id,
        date: dto.openedDate,
        stage: 'prevailing_wage',
        title: 'Case opened',
        createdBy: this.ctx.userId,
      });
      await tx.insert(t.eb3CaseDocuments).values(DEFAULT_CHECKLIST.map((docType) => ({ caseId: row.id, docType })));
      await tx.update(t.eb3Candidates).set({ status: 'case_open' }).where(eq(t.eb3Candidates.id, dto.candidateId));
      return row.id;
    });
    await this.audit.log('create', 'eb3_case', id, null, dto);
    return this.case(id);
  }

  async updateCase(id: string, dto: Partial<Eb3CaseDto> & { status?: string; notes?: string | null }) {
    const before = await this.case(id);
    const [row] = await this.ctx.db
      .update(t.eb3Cases)
      .set({ ...dto, agreedFee: dto.agreedFee ? m2(dto.agreedFee) : undefined })
      .where(eq(t.eb3Cases.id, id))
      .returning();
    await this.audit.log('update', 'eb3_case', id, before, row);
    return row;
  }

  /**
   * Records a stage milestone. `stage` only ever moves forward, but an earlier stage can be
   * back-dated for its reference numbers without rewinding the case.
   */
  async advance(id: string, dto: Eb3StageDto) {
    const before = await this.case(id);
    if (['closed', 'withdrawn'].includes(before.status)) throw new BadRequestException('This case is closed');
    const forward = stageIndex(dto.stage) > stageIndex(before.stage);
    const row = await this.ctx.db.transaction(async (tx) => {
      const patch: Record<string, unknown> = {
        permCaseNo: dto.permCaseNo ?? before.permCaseNo,
        i140Receipt: dto.i140Receipt ?? before.i140Receipt,
        nvcCaseNo: dto.nvcCaseNo ?? before.nvcCaseNo,
        interviewDate: dto.interviewDate ?? before.interviewDate,
        consulate: dto.consulate ?? before.consulate,
        visaNumber: dto.visaNumber ?? before.visaNumber,
        departureDate: dto.departureDate ?? before.departureDate,
      };
      if (forward) {
        patch.stage = dto.stage;
        patch.stageDate = dto.date;
      }
      // The PERM filing date is the priority date, and the case closes on denial or departure.
      if (dto.stage === 'perm_filed' && !before.priorityDate) patch.priorityDate = dto.date;
      if (dto.stage === 'visa_denied') patch.status = 'denied';
      if (dto.stage === 'departed') {
        patch.status = 'closed';
        patch.departureDate = dto.departureDate ?? dto.date;
      }
      const [updated] = await tx.update(t.eb3Cases).set(patch).where(eq(t.eb3Cases.id, id)).returning();
      await tx.insert(t.eb3CaseEvents).values({
        caseId: id,
        date: dto.date,
        stage: dto.stage,
        title: dto.stage.replace(/_/g, ' '),
        notes: dto.notes,
        createdBy: this.ctx.userId,
      });
      const candidateStatus = candidateStatusFor(dto.stage);
      if (candidateStatus) await tx.update(t.eb3Candidates).set({ status: candidateStatus }).where(eq(t.eb3Candidates.id, before.candidateId));
      return updated;
    });
    await this.audit.log('advance', 'eb3_case', id, { stage: before.stage }, { stage: row.stage, event: dto.stage, date: dto.date });
    // Candidates ask "where is my file?" constantly; the milestones answer it for them.
    if (MAILED_STAGES.has(dto.stage) && before.candidate.email) {
      void this.mail.send({
        to: { email: before.candidate.email, name: before.candidate.fullName },
        ...eb3CaseUpdate({
          company: this.ctx.tenant.name,
          candidateName: before.candidate.fullName,
          caseNo: before.no,
          stage: dto.stage,
          stageDate: dto.date,
          employer: before.employerName,
          interviewDate: row.interviewDate,
          consulate: row.consulate,
          notes: dto.notes,
        }),
      });
    }
    return this.case(id);
  }

  /** A free-text note on the case timeline, without a stage change. */
  async addEvent(id: string, dto: { date: string; title: string; notes?: string | null }) {
    await this.case(id);
    const [row] = await this.ctx.db
      .insert(t.eb3CaseEvents)
      .values({ caseId: id, date: dto.date, title: dto.title, notes: dto.notes, createdBy: this.ctx.userId })
      .returning();
    return row;
  }

  // ---------- document checklist ----------

  async addDocument(dto: Eb3CaseDocumentDto) {
    await this.case(dto.caseId);
    const [row] = await this.ctx.db.insert(t.eb3CaseDocuments).values(dto).returning();
    await this.audit.log('create', 'eb3_case_document', row.id, null, row);
    return row;
  }

  async updateDocument(id: string, dto: Partial<Eb3CaseDocumentDto>) {
    const [before] = await this.ctx.db.select().from(t.eb3CaseDocuments).where(eq(t.eb3CaseDocuments.id, id));
    if (!before) throw new NotFoundException();
    const [row] = await this.ctx.db.update(t.eb3CaseDocuments).set(dto).where(eq(t.eb3CaseDocuments.id, id)).returning();
    await this.audit.log('update', 'eb3_case_document', id, before, row);
    return row;
  }

  async removeDocument(id: string) {
    const [before] = await this.ctx.db.select().from(t.eb3CaseDocuments).where(eq(t.eb3CaseDocuments.id, id));
    if (!before) throw new NotFoundException();
    await this.ctx.db.delete(t.eb3CaseDocuments).where(eq(t.eb3CaseDocuments.id, id));
    await this.audit.log('delete', 'eb3_case_document', id, before, null);
    return { ok: true };
  }

  // ---------- fees ----------

  /**
   * Money in and out on a case.
   *   in  (service fee)      Dr cash/bank        Cr visa service income
   *   in  (other / refund)   Dr cash/bank        Cr candidate advances   — repayment of costs borne for them
   *   out (any)              Dr candidate advances  Cr cash/bank         — recoverable from the candidate
   */
  async pay(dto: Eb3PaymentDto) {
    const [candidate] = await this.ctx.db.select().from(t.eb3Candidates).where(eq(t.eb3Candidates.id, dto.candidateId));
    if (!candidate) throw new NotFoundException('Candidate not found');
    const id = await this.ctx.db.transaction(async (tx) => {
      const [acct] = await tx.select().from(t.accounts).where(eq(t.accounts.id, dto.cashAccountId));
      if (!acct || !['cash', 'bank'].includes(acct.subtype ?? '')) throw new BadRequestException('Select a cash or bank account');
      if (dto.caseId) {
        const [c] = await tx.select({ id: t.eb3Cases.id }).from(t.eb3Cases).where(eq(t.eb3Cases.id, dto.caseId));
        if (!c) throw new NotFoundException('Case not found');
      }
      const no = await this.numbering.next(tx, 'eb3_payment', dto.date);
      const [row] = await tx
        .insert(t.eb3Payments)
        .values({ ...dto, no, amount: m2(dto.amount), createdBy: this.ctx.userId })
        .returning({ id: t.eb3Payments.id });

      const counter = dto.direction === 'in' && dto.type === 'service_fee' ? 'eb3_income' : 'eb3_advance';
      const lines =
        dto.direction === 'in'
          ? [
              { account: { id: dto.cashAccountId }, debit: dto.amount, description: `${candidate.fullName} — ${dto.type}` },
              { account: counter, credit: dto.amount, description: candidate.fullName },
            ]
          : [
              { account: 'eb3_advance', debit: dto.amount, description: `${candidate.fullName} — ${dto.type}` },
              { account: { id: dto.cashAccountId }, credit: dto.amount, description: candidate.fullName },
            ];
      const entryId = await this.posting.post(tx, {
        date: dto.date,
        sourceType: 'eb3',
        sourceId: row.id,
        reference: dto.reference ?? no,
        narration: `EB-3 ${dto.type.replace(/_/g, ' ')} ${dto.direction === 'in' ? 'received from' : 'paid for'} ${candidate.fullName}`,
        lines,
      });
      await tx.update(t.eb3Payments).set({ journalEntryId: entryId }).where(eq(t.eb3Payments.id, row.id));
      return row.id;
    });
    await this.audit.log('post', 'eb3_payment', id, null, dto);
    const [row] = await this.ctx.db.select().from(t.eb3Payments).where(eq(t.eb3Payments.id, id));
    return row;
  }

  async payments(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.eb3Payments.no, t.eb3Payments.reference]),
      q.type ? eq(t.eb3Payments.type, q.type) : undefined,
      q.from ? sql`${t.eb3Payments.date} >= ${q.from}` : undefined,
      q.to ? sql`${t.eb3Payments.date} <= ${q.to}` : undefined,
    );
    const data = await db
      .select({
        id: t.eb3Payments.id,
        no: t.eb3Payments.no,
        date: t.eb3Payments.date,
        candidateName: t.eb3Candidates.fullName,
        caseNo: t.eb3Cases.no,
        type: t.eb3Payments.type,
        direction: t.eb3Payments.direction,
        amount: t.eb3Payments.amount,
        method: t.eb3Payments.method,
        reference: t.eb3Payments.reference,
        status: t.eb3Payments.status,
      })
      .from(t.eb3Payments)
      .innerJoin(t.eb3Candidates, eq(t.eb3Candidates.id, t.eb3Payments.candidateId))
      .leftJoin(t.eb3Cases, eq(t.eb3Cases.id, t.eb3Payments.caseId))
      .where(where)
      .orderBy(desc(t.eb3Payments.date), desc(t.eb3Payments.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.eb3Payments).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }
}
