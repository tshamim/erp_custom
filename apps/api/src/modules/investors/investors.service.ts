import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import type { InvestmentAgreementDto, InvestorDto, InvestorTransactionDto, ListQuery, ProfitAllocationDto } from '@erp/shared';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { NumberingService } from '../../common/numbering.service';
import { PostingService } from '../../ledger/posting.service';
import { D, Decimal, m2, pct, sum } from '../../common/money';
import { searchClause } from '../../common/pagination';

export interface ProfitInputs {
  /** Project profit for the period: revenue less costs, both from the ledger. */
  projectProfit: Decimal;
  profitSharePercent: string;
  sharesLoss: boolean;
  alreadyAllocated: Decimal;
}

/**
 * An investor's entitlement for a period. Pure.
 * Entitlement is the agreed share of the project's profit; a loss reduces it only when the
 * agreement says the investor carries losses. What is still to book is entitlement less
 * what has already been booked, so allocations can run repeatedly without double counting.
 */
export function computeEntitlement(i: ProfitInputs) {
  const share = pct(i.projectProfit, i.profitSharePercent);
  const entitlement = share.isNegative() && !i.sharesLoss ? new Decimal(0) : share;
  return { entitlement, outstanding: entitlement.minus(i.alreadyAllocated) };
}

@Injectable()
export class InvestorsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly posting: PostingService,
  ) {}

  // ---------------- investors ----------------

  async list(q: ListQuery) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.investors.code, t.investors.name, t.investors.phone, t.investors.nid]),
      q.status ? eq(t.investors.status, q.status) : undefined,
    );
    const data = await db
      .select({
        id: t.investors.id,
        code: t.investors.code,
        name: t.investors.name,
        type: t.investors.type,
        phone: t.investors.phone,
        status: t.investors.status,
        committed: sql<string>`coalesce((select sum(a.committed_amount) from investment_agreements a where a.investor_id = investors.id and a.status <> 'cancelled'), 0)`,
        contributed: sql<string>`coalesce((select sum(x.amount) from investor_transactions x where x.investor_id = investors.id and x.type = 'contribution' and x.status = 'posted'), 0)`,
        profitBooked: sql<string>`coalesce((select sum(case when x.type = 'profit_share' then x.amount else -x.amount end) from investor_transactions x where x.investor_id = investors.id and x.type in ('profit_share','loss_share') and x.status = 'posted'), 0)`,
        paidOut: sql<string>`coalesce((select sum(x.amount) from investor_transactions x where x.investor_id = investors.id and x.type = 'payout' and x.status = 'posted'), 0)`,
        projects: sql<number>`(select count(distinct a.project_id)::int from investment_agreements a where a.investor_id = investors.id and a.status <> 'cancelled')`,
      })
      .from(t.investors)
      .where(where)
      .orderBy(asc(t.investors.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.investors).where(where);
    return { data: data.map((r) => ({ ...r, balance: m2(D(r.contributed).plus(r.profitBooked).minus(r.paidOut)) })), total: count, page: q.page, pageSize: q.pageSize };
  }

  async create(dto: InvestorDto) {
    const code = dto.code || (await this.numbering.next(this.ctx.db, 'investor'));
    const [row] = await this.ctx.db
      .insert(t.investors)
      .values({ ...dto, code, email: dto.email || null })
      .returning();
    await this.audit.log('create', 'investor', row.id, null, row);
    return row;
  }

  async update(id: string, dto: Partial<InvestorDto>) {
    const before = await this.findInvestor(id);
    const [row] = await this.ctx.db
      .update(t.investors)
      .set({ ...dto, email: dto.email === '' ? null : dto.email })
      .where(eq(t.investors.id, id))
      .returning();
    await this.audit.log('update', 'investor', id, before, row);
    return row;
  }

  private async findInvestor(id: string) {
    const [row] = await this.ctx.db.select().from(t.investors).where(eq(t.investors.id, id));
    if (!row) throw new NotFoundException('Investor not found');
    return row;
  }

  /** Profit of one project over a period, straight from the ledger. */
  private async projectProfit(db: TenantDb, projectId: string, from?: string | null, to?: string | null) {
    const [row] = await db
      .select({
        income: sql<string>`coalesce(sum(${t.journalLines.credit} - ${t.journalLines.debit}) filter (where ${t.accounts.type} = 'income'), 0)`,
        expense: sql<string>`coalesce(sum(${t.journalLines.debit} - ${t.journalLines.credit}) filter (where ${t.accounts.type} = 'expense'), 0)`,
      })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .innerJoin(t.accounts, eq(t.accounts.id, t.journalLines.accountId))
      .where(
        and(
          eq(t.journalLines.projectId, projectId),
          sql`${t.journalEntries.status} in ('posted','reversed')`,
          from ? gte(t.journalEntries.date, from) : undefined,
          to ? lte(t.journalEntries.date, to) : undefined,
        ),
      );
    // The investor's own profit share is an appropriation, not a project cost — exclude it.
    const [share] = await db
      .select({ amount: sql<string>`coalesce(sum(${t.journalLines.debit} - ${t.journalLines.credit}), 0)` })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .innerJoin(t.accountMappings, eq(t.accountMappings.accountId, t.journalLines.accountId))
      .where(
        and(
          eq(t.journalLines.projectId, projectId),
          eq(t.accountMappings.key, 'investor_profit_share'),
          sql`${t.journalEntries.status} in ('posted','reversed')`,
          from ? gte(t.journalEntries.date, from) : undefined,
          to ? lte(t.journalEntries.date, to) : undefined,
        ),
      );
    return D(row.income).minus(row.expense).plus(share.amount);
  }

  // ---------------- agreements ----------------

  async agreements(q: ListQuery & { investorId?: string }) {
    const db = this.ctx.db;
    const where = and(
      q.investorId ? eq(t.investmentAgreements.investorId, q.investorId) : undefined,
      q.projectId ? eq(t.investmentAgreements.projectId, q.projectId) : undefined,
      q.status ? eq(t.investmentAgreements.status, q.status) : undefined,
    );
    const rows = await db
      .select({
        a: t.investmentAgreements,
        investorName: t.investors.name,
        investorCode: t.investors.code,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.investmentAgreements)
      .innerJoin(t.investors, eq(t.investors.id, t.investmentAgreements.investorId))
      .innerJoin(t.projects, eq(t.projects.id, t.investmentAgreements.projectId))
      .where(where)
      .orderBy(desc(t.investmentAgreements.date))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.investmentAgreements).where(where);
    return {
      data: rows.map((r) => ({ ...r.a, investorName: r.investorName, investorCode: r.investorCode, projectName: r.projectName, projectCode: r.projectCode })),
      total: count,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async createAgreement(dto: InvestmentAgreementDto) {
    const db = this.ctx.db;
    const [existing] = await db
      .select({ total: sql<string>`coalesce(sum(${t.investmentAgreements.profitSharePercent}), 0)` })
      .from(t.investmentAgreements)
      .where(and(eq(t.investmentAgreements.projectId, dto.projectId), sql`${t.investmentAgreements.status} in ('draft','active')`));
    if (D(existing.total).plus(dto.profitSharePercent).greaterThan(100)) {
      throw new BadRequestException(`Investor shares on this project would total ${D(existing.total).plus(dto.profitSharePercent).toFixed(2)}% — more than the profit`);
    }
    const no = await this.numbering.next(db, 'investment_agreement', dto.date);
    const [row] = await db.insert(t.investmentAgreements).values({ ...dto, no, createdBy: this.ctx.userId }).returning();
    await this.audit.log('create', 'investment_agreement', row.id, null, row);
    return row;
  }

  async updateAgreement(id: string, dto: Partial<InvestmentAgreementDto>) {
    const [before] = await this.ctx.db.select().from(t.investmentAgreements).where(eq(t.investmentAgreements.id, id));
    if (!before) throw new NotFoundException();
    const [row] = await this.ctx.db.update(t.investmentAgreements).set(dto).where(eq(t.investmentAgreements.id, id)).returning();
    await this.audit.log('update', 'investment_agreement', id, before, row);
    return row;
  }

  // ---------------- money in and out ----------------

  /**
   * contribution  Dr cash/bank            Cr investor capital
   * payout        Dr investor capital     Cr cash/bank
   */
  async transact(dto: InvestorTransactionDto) {
    const investor = await this.findInvestor(dto.investorId);
    const id = await this.ctx.db.transaction(async (tx) => {
      const [acct] = await tx.select().from(t.accounts).where(eq(t.accounts.id, dto.cashAccountId));
      if (!acct || !['cash', 'bank'].includes(acct.subtype ?? '')) throw new BadRequestException('Select a cash or bank account');
      if (dto.type === 'payout') {
        const balance = await this.balance(tx, dto.investorId);
        if (D(dto.amount).greaterThan(balance)) {
          throw new BadRequestException(`Payout exceeds the investor's balance of ${balance.toFixed(2)}`);
        }
      }
      const no = await this.numbering.next(tx, `investor_${dto.type}`, dto.date);
      const [row] = await tx
        .insert(t.investorTransactions)
        .values({ ...dto, no, amount: m2(dto.amount), createdBy: this.ctx.userId })
        .returning({ id: t.investorTransactions.id });
      const lines =
        dto.type === 'contribution'
          ? [
              { account: { id: dto.cashAccountId }, debit: dto.amount, projectId: dto.projectId, description: `Investment from ${investor.name}` },
              { account: 'investor_capital', credit: dto.amount, projectId: dto.projectId, description: investor.name },
            ]
          : [
              { account: 'investor_capital', debit: dto.amount, projectId: dto.projectId, description: investor.name },
              { account: { id: dto.cashAccountId }, credit: dto.amount, projectId: dto.projectId, description: `Payout to ${investor.name}` },
            ];
      const entryId = await this.posting.post(tx, {
        date: dto.date,
        sourceType: 'investor',
        sourceId: row.id,
        reference: dto.reference ?? no,
        narration: `${dto.type === 'contribution' ? 'Investment received from' : 'Payout to'} ${investor.name}`,
        lines,
      });
      await tx.update(t.investorTransactions).set({ journalEntryId: entryId }).where(eq(t.investorTransactions.id, row.id));
      return row.id;
    });
    await this.audit.log('post', 'investor_transaction', id, null, dto);
    return this.getTransaction(id);
  }

  /** Capital contributed plus profit booked, less payouts. */
  private async balance(db: TenantDb, investorId: string): Promise<Decimal> {
    const rows = await db
      .select({ type: t.investorTransactions.type, amount: t.investorTransactions.amount })
      .from(t.investorTransactions)
      .where(and(eq(t.investorTransactions.investorId, investorId), eq(t.investorTransactions.status, 'posted')));
    return rows.reduce((acc, r) => {
      if (r.type === 'contribution' || r.type === 'profit_share') return acc.plus(r.amount);
      return acc.minus(r.amount); // payout, loss_share
    }, new Decimal(0));
  }

  /** Every movement across all investors — the transparent cash trail. */
  async transactions(q: ListQuery & { investorId?: string }) {
    const db = this.ctx.db;
    const where = and(
      searchClause(q, [t.investorTransactions.no, t.investorTransactions.reference]),
      q.investorId ? eq(t.investorTransactions.investorId, q.investorId) : undefined,
      q.projectId ? eq(t.investorTransactions.projectId, q.projectId) : undefined,
      q.type ? eq(t.investorTransactions.type, q.type) : undefined,
      q.status ? eq(t.investorTransactions.status, q.status) : undefined,
      q.from ? gte(t.investorTransactions.date, q.from) : undefined,
      q.to ? lte(t.investorTransactions.date, q.to) : undefined,
    );
    const data = await db
      .select({
        id: t.investorTransactions.id,
        no: t.investorTransactions.no,
        date: t.investorTransactions.date,
        investorId: t.investorTransactions.investorId,
        investorName: t.investors.name,
        projectName: t.projects.name,
        type: t.investorTransactions.type,
        amount: t.investorTransactions.amount,
        method: t.investorTransactions.method,
        reference: t.investorTransactions.reference,
        periodFrom: t.investorTransactions.periodFrom,
        periodTo: t.investorTransactions.periodTo,
        status: t.investorTransactions.status,
        journalEntryId: t.investorTransactions.journalEntryId,
      })
      .from(t.investorTransactions)
      .innerJoin(t.investors, eq(t.investors.id, t.investorTransactions.investorId))
      .leftJoin(t.projects, eq(t.projects.id, t.investorTransactions.projectId))
      .where(where)
      .orderBy(desc(t.investorTransactions.date), desc(t.investorTransactions.no))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(t.investorTransactions).where(where);
    return { data, total: count, page: q.page, pageSize: q.pageSize };
  }

  async getTransaction(id: string) {
    const [row] = await this.ctx.db
      .select({ x: t.investorTransactions, investorName: t.investors.name, projectName: t.projects.name })
      .from(t.investorTransactions)
      .innerJoin(t.investors, eq(t.investors.id, t.investorTransactions.investorId))
      .leftJoin(t.projects, eq(t.projects.id, t.investorTransactions.projectId))
      .where(eq(t.investorTransactions.id, id));
    if (!row) throw new NotFoundException();
    return { ...row.x, investorName: row.investorName, projectName: row.projectName };
  }

  async cancelTransaction(id: string) {
    const txn = await this.getTransaction(id);
    if (txn.status !== 'posted') throw new BadRequestException(`Transaction is ${txn.status}`);
    await this.ctx.db.transaction(async (tx) => {
      if (txn.journalEntryId) await this.posting.reverse(tx, txn.journalEntryId, new Date().toISOString().slice(0, 10));
      await tx.update(t.investorTransactions).set({ status: 'cancelled' }).where(eq(t.investorTransactions.id, id));
    });
    await this.audit.log('cancel', 'investor_transaction', id);
    return this.getTransaction(id);
  }

  // ---------------- profit sharing ----------------

  /** What each investor on a project is entitled to, what has been booked, and what is still to book. */
  async entitlements(projectId: string, from?: string, to?: string) {
    const db = this.ctx.db;
    const [project] = await db.select().from(t.projects).where(eq(t.projects.id, projectId));
    if (!project) throw new NotFoundException('Project not found');
    const profit = await this.projectProfit(db, projectId, from, to);
    const agreements = await db
      .select({ a: t.investmentAgreements, investorName: t.investors.name, investorCode: t.investors.code })
      .from(t.investmentAgreements)
      .innerJoin(t.investors, eq(t.investors.id, t.investmentAgreements.investorId))
      .where(and(eq(t.investmentAgreements.projectId, projectId), sql`${t.investmentAgreements.status} in ('draft','active','closed')`));

    const rows = await Promise.all(
      agreements.map(async ({ a, investorName, investorCode }) => {
        const [booked] = await db
          .select({ amount: sql<string>`coalesce(sum(case when ${t.investorTransactions.type} = 'profit_share' then ${t.investorTransactions.amount} else -${t.investorTransactions.amount} end), 0)` })
          .from(t.investorTransactions)
          .where(
            and(
              eq(t.investorTransactions.agreementId, a.id),
              sql`${t.investorTransactions.type} in ('profit_share','loss_share')`,
              eq(t.investorTransactions.status, 'posted'),
              from ? gte(t.investorTransactions.periodFrom, from) : undefined,
              to ? lte(t.investorTransactions.periodTo, to) : undefined,
            ),
          );
        const { entitlement, outstanding } = computeEntitlement({
          projectProfit: profit,
          profitSharePercent: a.profitSharePercent,
          sharesLoss: a.sharesLoss,
          alreadyAllocated: D(booked.amount),
        });
        const [contributed] = await db
          .select({ amount: sql<string>`coalesce(sum(${t.investorTransactions.amount}), 0)` })
          .from(t.investorTransactions)
          .where(and(eq(t.investorTransactions.agreementId, a.id), eq(t.investorTransactions.type, 'contribution'), eq(t.investorTransactions.status, 'posted')));
        return {
          agreementId: a.id,
          agreementNo: a.no,
          investorId: a.investorId,
          investorName,
          investorCode,
          committedAmount: a.committedAmount,
          contributed: m2(contributed.amount),
          profitSharePercent: a.profitSharePercent,
          sharesLoss: a.sharesLoss,
          entitlement: m2(entitlement),
          booked: m2(booked.amount),
          toBook: m2(outstanding),
          status: a.status,
        };
      }),
    );

    return {
      project: { id: project.id, code: project.code, name: project.name },
      period: { from: from ?? null, to: to ?? null },
      projectProfit: m2(profit),
      totalSharePercent: m2(sum(rows.map((r) => r.profitSharePercent))),
      companyShare: m2(profit.minus(sum(rows.map((r) => r.entitlement)))),
      investors: rows,
    };
  }

  /**
   * Books a share of profit (or loss) to the investor:
   *   profit  Dr investor profit share   Cr investor payable
   *   loss    Dr investor payable        Cr investor profit share
   */
  async allocateProfit(dto: ProfitAllocationDto) {
    const db = this.ctx.db;
    const [agreement] = await db.select().from(t.investmentAgreements).where(eq(t.investmentAgreements.id, dto.agreementId));
    if (!agreement) throw new NotFoundException('Agreement not found');
    if (agreement.status === 'cancelled') throw new BadRequestException('Agreement is cancelled');
    const investor = await this.findInvestor(agreement.investorId);

    const computed = await this.entitlements(agreement.projectId, dto.periodFrom, dto.periodTo);
    const line = computed.investors.find((x) => x.agreementId === agreement.id)!;
    const amount = dto.amount != null && dto.amount !== '' ? D(dto.amount) : D(line.toBook);
    if (amount.isZero()) throw new BadRequestException('Nothing to allocate for this period');

    const isProfit = amount.isPositive();
    const value = amount.abs();
    const id = await db.transaction(async (tx) => {
      const no = await this.numbering.next(tx, 'investor_profit', dto.date);
      const [row] = await tx
        .insert(t.investorTransactions)
        .values({
          no,
          investorId: agreement.investorId,
          agreementId: agreement.id,
          projectId: agreement.projectId,
          date: dto.date,
          type: isProfit ? 'profit_share' : 'loss_share',
          amount: m2(value),
          periodFrom: dto.periodFrom,
          periodTo: dto.periodTo,
          notes: dto.notes,
          createdBy: this.ctx.userId,
        })
        .returning({ id: t.investorTransactions.id });
      const lines = isProfit
        ? [
            { account: 'investor_profit_share', debit: value, projectId: agreement.projectId, description: `${investor.name} — ${agreement.profitSharePercent}% share` },
            { account: 'investor_payable', credit: value, projectId: agreement.projectId, description: investor.name },
          ]
        : [
            { account: 'investor_payable', debit: value, projectId: agreement.projectId, description: investor.name },
            { account: 'investor_profit_share', credit: value, projectId: agreement.projectId, description: `${investor.name} — share of loss` },
          ];
      const entryId = await this.posting.post(tx, {
        date: dto.date,
        sourceType: 'investor',
        sourceId: row.id,
        reference: no,
        narration: `${isProfit ? 'Profit' : 'Loss'} share ${dto.periodFrom} to ${dto.periodTo} — ${investor.name}`,
        lines,
      });
      await tx.update(t.investorTransactions).set({ journalEntryId: entryId }).where(eq(t.investorTransactions.id, row.id));
      return row.id;
    });
    await this.audit.log('post', 'investor_profit_share', id, null, { ...dto, amount: m2(amount) });
    return this.getTransaction(id);
  }

  /** Everything one investor has put in, earned and taken out, with a running balance. */
  async statement(investorId: string) {
    const investor = await this.findInvestor(investorId);
    const db = this.ctx.db;
    const agreements = await db
      .select({ a: t.investmentAgreements, projectCode: t.projects.code, projectName: t.projects.name })
      .from(t.investmentAgreements)
      .innerJoin(t.projects, eq(t.projects.id, t.investmentAgreements.projectId))
      .where(eq(t.investmentAgreements.investorId, investorId))
      .orderBy(desc(t.investmentAgreements.date));

    const txns = await db
      .select({ x: t.investorTransactions, projectCode: t.projects.code })
      .from(t.investorTransactions)
      .leftJoin(t.projects, eq(t.projects.id, t.investorTransactions.projectId))
      .where(and(eq(t.investorTransactions.investorId, investorId), eq(t.investorTransactions.status, 'posted')))
      .orderBy(asc(t.investorTransactions.date), asc(t.investorTransactions.createdAt));

    let running = new Decimal(0);
    const lines = txns.map(({ x, projectCode }) => {
      const inflow = x.type === 'contribution' || x.type === 'profit_share';
      running = inflow ? running.plus(x.amount) : running.minus(x.amount);
      return {
        id: x.id,
        no: x.no,
        date: x.date,
        type: x.type,
        projectCode,
        periodFrom: x.periodFrom,
        periodTo: x.periodTo,
        credit: inflow ? m2(x.amount) : '0.00',
        debit: inflow ? '0.00' : m2(x.amount),
        balance: m2(running),
        reference: x.reference,
        notes: x.notes,
      };
    });

    const total = (type: string) => m2(sum(txns.filter((r) => r.x.type === type).map((r) => r.x.amount)));
    // Live entitlement across every project this investor is in, so the statement shows what is
    // owed today — not only what has already been booked.
    const live = await Promise.all(
      agreements.map(async ({ a, projectCode, projectName }) => {
        const computed = await this.entitlements(a.projectId);
        const row = computed.investors.find((x) => x.agreementId === a.id)!;
        return { agreementNo: a.no, projectCode, projectName, committedAmount: a.committedAmount, contributed: row.contributed, profitSharePercent: a.profitSharePercent, projectProfit: computed.projectProfit, entitlement: row.entitlement, booked: row.booked, toBook: row.toBook, status: a.status };
      }),
    );

    return {
      investor,
      summary: {
        contributed: total('contribution'),
        profitBooked: total('profit_share'),
        lossBooked: total('loss_share'),
        paidOut: total('payout'),
        balance: m2(running),
      },
      agreements: live,
      lines,
    };
  }
}
