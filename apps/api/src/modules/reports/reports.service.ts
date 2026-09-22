import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import { TenantContext } from '../../tenancy/tenant-context';
import { D, Decimal, m2, sum } from '../../common/money';

const POSTED = sql`${t.journalEntries.status} in ('posted','reversed')`;

@Injectable()
export class ReportsService {
  constructor(private readonly ctx: TenantContext) {}

  /** Account movements between dates (inclusive), with optional project filter. */
  private async movements(from: string | null, to: string, projectId?: string) {
    return this.ctx.db
      .select({
        id: t.accounts.id,
        code: t.accounts.code,
        name: t.accounts.name,
        type: t.accounts.type,
        parentId: t.accounts.parentId,
        debit: sql<string>`sum(${t.journalLines.debit})`,
        credit: sql<string>`sum(${t.journalLines.credit})`,
      })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .innerJoin(t.accounts, eq(t.accounts.id, t.journalLines.accountId))
      .where(
        and(
          POSTED,
          lte(t.journalEntries.date, to),
          from ? gte(t.journalEntries.date, from) : undefined,
          projectId ? eq(t.journalLines.projectId, projectId) : undefined,
        ),
      )
      .groupBy(t.accounts.id, t.accounts.code, t.accounts.name, t.accounts.type, t.accounts.parentId)
      .orderBy(asc(t.accounts.code));
  }

  async trialBalance(asOf: string) {
    const rows = await this.movements(null, asOf);
    const data = rows.map((r) => {
      const net = D(r.debit).minus(r.credit);
      return { ...r, debit: m2(net.isPositive() ? net : 0), credit: m2(net.isNegative() ? net.abs() : 0) };
    }).filter((r) => r.debit !== '0.00' || r.credit !== '0.00');
    const totalDebit = sum(data.map((r) => r.debit));
    const totalCredit = sum(data.map((r) => r.credit));
    return { asOf, rows: data, totalDebit: m2(totalDebit), totalCredit: m2(totalCredit), balanced: totalDebit.equals(totalCredit) };
  }

  async profitAndLoss(from: string, to: string, projectId?: string) {
    const rows = (await this.movements(from, to, projectId)).filter((r) => r.type === 'income' || r.type === 'expense');
    const income = rows.filter((r) => r.type === 'income').map((r) => ({ code: r.code, name: r.name, amount: m2(D(r.credit).minus(r.debit)) }));
    const expense = rows.filter((r) => r.type === 'expense').map((r) => ({ code: r.code, name: r.name, amount: m2(D(r.debit).minus(r.credit)) }));
    const totalIncome = sum(income.map((r) => r.amount));
    const totalExpense = sum(expense.map((r) => r.amount));
    const directCost = sum(expense.filter((e) => e.code.startsWith('5')).map((e) => e.amount));
    return {
      from, to, projectId: projectId ?? null, income, expense,
      totalIncome: m2(totalIncome), totalExpense: m2(totalExpense),
      grossProfit: m2(totalIncome.minus(directCost)), netProfit: m2(totalIncome.minus(totalExpense)),
    };
  }

  async balanceSheet(asOf: string) {
    const rows = await this.movements(null, asOf);
    const section = (type: string, sign: 1 | -1) =>
      rows.filter((r) => r.type === type).map((r) => ({ code: r.code, name: r.name, amount: m2(D(r.debit).minus(r.credit).times(sign)) })).filter((r) => r.amount !== '0.00');
    const assets = section('asset', 1);
    const liabilities = section('liability', -1);
    const equity = section('equity', -1);
    const pl = rows.filter((r) => r.type === 'income' || r.type === 'expense').reduce((a, r) => a.plus(D(r.credit).minus(r.debit)), new Decimal(0));
    equity.push({ code: '—', name: 'Current period profit / (loss)', amount: m2(pl) });
    const tA = sum(assets.map((a) => a.amount));
    const tL = sum(liabilities.map((a) => a.amount));
    const tE = sum(equity.map((a) => a.amount));
    return { asOf, assets, liabilities, equity, totalAssets: m2(tA), totalLiabilities: m2(tL), totalEquity: m2(tE), balanced: tA.equals(tL.plus(tE)) };
  }

  async generalLedger(accountId: string, from: string, to: string) {
    const db = this.ctx.db;
    const [acct] = await db.select().from(t.accounts).where(eq(t.accounts.id, accountId));
    if (!acct) throw new BadRequestException('Account not found');
    const [open] = await db
      .select({ bal: sql<string>`coalesce(sum(${t.journalLines.debit} - ${t.journalLines.credit}), 0)` })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .where(and(POSTED, eq(t.journalLines.accountId, accountId), lt(t.journalEntries.date, from)));
    const lines = await db
      .select({
        date: t.journalEntries.date,
        no: t.journalEntries.no,
        entryId: t.journalEntries.id,
        sourceType: t.journalEntries.sourceType,
        narration: t.journalEntries.narration,
        description: t.journalLines.description,
        debit: t.journalLines.debit,
        credit: t.journalLines.credit,
        partyName: t.parties.name,
        projectName: t.projects.name,
      })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .leftJoin(t.parties, eq(t.parties.id, t.journalLines.partyId))
      .leftJoin(t.projects, eq(t.projects.id, t.journalLines.projectId))
      .where(and(POSTED, eq(t.journalLines.accountId, accountId), gte(t.journalEntries.date, from), lte(t.journalEntries.date, to)))
      .orderBy(asc(t.journalEntries.date), asc(t.journalEntries.no));
    let bal = D(open.bal);
    return {
      account: acct,
      opening: m2(bal),
      lines: lines.map((l) => {
        bal = bal.plus(D(l.debit)).minus(D(l.credit));
        return { ...l, balance: m2(bal) };
      }),
      closing: m2(bal),
    };
  }

  /** Outstanding invoices (AR) or bills (AP) bucketed by days past due date (or doc date). */
  async aging(kind: 'ar' | 'ap', asOf: string) {
    const db = this.ctx.db;
    const table = kind === 'ar' ? t.invoices : t.bills;
    const rows = await db
      .select({
        partyId: t.parties.id,
        partyName: t.parties.name,
        no: table.no,
        date: table.date,
        dueDate: table.dueDate,
        outstanding: sql<string>`${table.total} - ${table.paidAmount}`,
      })
      .from(table)
      .innerJoin(t.parties, eq(t.parties.id, table.partyId))
      .where(and(inArray(table.status, ['posted', 'partially_paid']), lte(table.date, asOf)));
    const buckets = ['current', '1-30', '31-60', '61-90', '90+'] as const;
    const byParty = new Map<string, { partyName: string; total: Decimal } & Record<(typeof buckets)[number], Decimal>>();
    for (const r of rows) {
      const days = Math.floor((Date.parse(asOf) - Date.parse(r.dueDate ?? r.date)) / 86_400_000);
      const b = days <= 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      const cur = byParty.get(r.partyId) ?? { partyName: r.partyName, total: new Decimal(0), current: new Decimal(0), '1-30': new Decimal(0), '31-60': new Decimal(0), '61-90': new Decimal(0), '90+': new Decimal(0) };
      cur[b] = cur[b].plus(D(r.outstanding));
      cur.total = cur.total.plus(D(r.outstanding));
      byParty.set(r.partyId, cur);
    }
    const parties = [...byParty.values()].map((p) => ({
      partyName: p.partyName,
      total: m2(p.total),
      ...Object.fromEntries(buckets.map((b) => [b, m2(p[b])])),
    }));
    return { kind, asOf, buckets, parties, documents: rows };
  }

  /** VAT output vs input and withholding (TDS/VDS) for a period — basis for Mushak 9.1 and TDS returns. */
  async taxSummary(from: string, to: string) {
    const db = this.ctx.db;
    const [out] = await db
      .select({ base: sql<string>`coalesce(sum(${t.invoices.subtotal}), 0)`, vat: sql<string>`coalesce(sum(${t.invoices.vatAmount}), 0)` })
      .from(t.invoices)
      .where(and(inArray(t.invoices.status, ['posted', 'partially_paid', 'paid']), gte(t.invoices.date, from), lte(t.invoices.date, to)));
    const [inp] = await db
      .select({ base: sql<string>`coalesce(sum(${t.bills.subtotal}), 0)`, vat: sql<string>`coalesce(sum(${t.bills.vatAmount}), 0)` })
      .from(t.bills)
      .where(and(inArray(t.bills.status, ['posted', 'partially_paid', 'paid']), gte(t.bills.date, from), lte(t.bills.date, to)));
    const withholding = await db
      .select({
        direction: t.payments.direction,
        partyName: t.parties.name,
        partyTin: t.parties.tin,
        partyBin: t.parties.binNo,
        no: t.payments.no,
        date: t.payments.date,
        amount: t.payments.amount,
        tdsAmount: t.payments.tdsAmount,
        vdsAmount: t.payments.vdsAmount,
      })
      .from(t.payments)
      .innerJoin(t.parties, eq(t.parties.id, t.payments.partyId))
      .where(and(eq(t.payments.status, 'posted'), gte(t.payments.date, from), lte(t.payments.date, to), sql`(${t.payments.tdsAmount} > 0 or ${t.payments.vdsAmount} > 0)`))
      .orderBy(asc(t.payments.date));
    const [salaryTds] = await db
      .select({ tds: sql<string>`coalesce(sum(${t.payslips.tds}), 0)` })
      .from(t.payslips)
      .innerJoin(t.payrollRuns, eq(t.payrollRuns.id, t.payslips.runId))
      .where(and(eq(t.payrollRuns.status, 'finalized'), gte(t.payrollRuns.periodEnd, from), lte(t.payrollRuns.periodEnd, to)));
    const deductedOut = withholding.filter((w) => w.direction === 'out');
    const deductedByClients = withholding.filter((w) => w.direction === 'in');
    return {
      from, to,
      vat: { outputBase: m2(out.base), outputVat: m2(out.vat), inputBase: m2(inp.base), inputVat: m2(inp.vat), netPayable: m2(D(out.vat).minus(inp.vat)) },
      tdsDeductedFromVendors: m2(sum(deductedOut.map((w) => w.tdsAmount))),
      vdsDeductedFromVendors: m2(sum(deductedOut.map((w) => w.vdsAmount))),
      tdsOnSalary: m2(salaryTds.tds),
      aitDeductedByClients: m2(sum(deductedByClients.map((w) => w.tdsAmount))),
      vdsDeductedByClients: m2(sum(deductedByClients.map((w) => w.vdsAmount))),
      withholding,
    };
  }

  async stockValuation(warehouseId?: string) {
    const rows = await this.ctx.db
      .select({
        itemCode: t.items.code,
        itemName: t.items.name,
        category: t.itemCategories.name,
        uom: t.uoms.code,
        warehouse: t.warehouses.name,
        quantity: t.stockBalances.quantity,
        avgCost: t.stockBalances.avgCost,
        value: t.stockBalances.value,
      })
      .from(t.stockBalances)
      .innerJoin(t.items, eq(t.items.id, t.stockBalances.itemId))
      .innerJoin(t.uoms, eq(t.uoms.id, t.items.uomId))
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.stockBalances.warehouseId))
      .leftJoin(t.itemCategories, eq(t.itemCategories.id, t.items.categoryId))
      .where(and(sql`${t.stockBalances.quantity} <> 0`, warehouseId ? eq(t.stockBalances.warehouseId, warehouseId) : undefined))
      .orderBy(asc(t.items.code));
    return { rows, totalValue: m2(sum(rows.map((r) => r.value))) };
  }

  async dashboard() {
    const db = this.ctx.db;
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const accBal = async (subtypes: string[], type: 'asset' | 'liability') => {
      const [r] = await db
        .select({ bal: sql<string>`coalesce(sum(${t.journalLines.debit} - ${t.journalLines.credit}), 0)` })
        .from(t.journalLines)
        .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
        .innerJoin(t.accounts, eq(t.accounts.id, t.journalLines.accountId))
        .where(and(POSTED, inArray(t.accounts.subtype, subtypes), eq(t.accounts.type, type)));
      return D(r.bal);
    };
    const [projects] = await db
      .select({
        active: sql<number>`count(*) filter (where ${t.projects.status} = 'active')::int`,
        total: sql<number>`count(*)::int`,
        contractValue: sql<string>`coalesce(sum(${t.projects.contractValue}) filter (where ${t.projects.status} in ('active','planning')), 0)`,
      })
      .from(t.projects);
    const [emp] = await db
      .select({ active: sql<number>`count(*) filter (where ${t.employees.status} = 'active')::int`, daily: sql<number>`count(*) filter (where ${t.employees.status} = 'active' and ${t.employees.employmentType} = 'daily_wage')::int` })
      .from(t.employees);
    const [att] = await db
      .select({ present: sql<number>`count(*) filter (where ${t.attendance.status} in ('present','late'))::int`, absent: sql<number>`count(*) filter (where ${t.attendance.status} = 'absent')::int` })
      .from(t.attendance)
      .where(eq(t.attendance.date, today));
    const [pending] = await db
      .select({
        leave: sql<number>`(select count(*)::int from ${t.leaveRequests} where ${t.leaveRequests.status} = 'pending')`,
        pos: sql<number>`(select count(*)::int from ${t.purchaseOrders} where ${t.purchaseOrders.status} = 'draft')`,
        prs: sql<number>`(select count(*)::int from ${t.purchaseRequisitions} where ${t.purchaseRequisitions.status} = 'submitted')`,
        siteReqs: sql<number>`(select count(*)::int from ${t.siteRequisitions} where ${t.siteRequisitions.status} = 'submitted')`,
        raBills: sql<number>`(select count(*)::int from ${t.raBills} where ${t.raBills.status} in ('draft','submitted'))`,
      })
      .from(sql`(select 1) x`);
    const [stock] = await db.select({ value: sql<string>`coalesce(sum(${t.stockBalances.value}), 0)` }).from(t.stockBalances);
    const lowStock = await db
      .select({ code: t.items.code, name: t.items.name, onHand: sql<string>`coalesce(sum(${t.stockBalances.quantity}), 0)`, reorderLevel: t.items.reorderLevel })
      .from(t.items)
      .leftJoin(t.stockBalances, eq(t.stockBalances.itemId, t.items.id))
      .where(sql`${t.items.reorderLevel} > 0`)
      .groupBy(t.items.id, t.items.code, t.items.name, t.items.reorderLevel)
      .having(sql`coalesce(sum(${t.stockBalances.quantity}), 0) <= ${t.items.reorderLevel}`)
      .limit(10);
    const pl = await this.profitAndLoss(monthStart, today);
    const trend = await db
      .select({
        month: sql<string>`to_char(${t.journalEntries.date}, 'YYYY-MM')`,
        income: sql<string>`coalesce(sum(${t.journalLines.credit} - ${t.journalLines.debit}) filter (where ${t.accounts.type} = 'income'), 0)`,
        expense: sql<string>`coalesce(sum(${t.journalLines.debit} - ${t.journalLines.credit}) filter (where ${t.accounts.type} = 'expense'), 0)`,
      })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .innerJoin(t.accounts, eq(t.accounts.id, t.journalLines.accountId))
      .where(and(POSTED, gte(t.journalEntries.date, sql`(date_trunc('month', current_date) - interval '5 months')::date`)))
      .groupBy(sql`to_char(${t.journalEntries.date}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${t.journalEntries.date}, 'YYYY-MM')`);

    return {
      cash: m2(await accBal(['cash', 'bank'], 'asset')),
      receivable: m2(await accBal(['receivable'], 'asset')),
      payable: m2((await accBal(['payable'], 'liability')).negated()),
      retentionReceivable: m2(await accBal(['retention'], 'asset')),
      stockValue: m2(stock.value),
      monthIncome: pl.totalIncome,
      monthExpense: pl.totalExpense,
      monthProfit: pl.netProfit,
      projects,
      employees: emp,
      attendanceToday: att,
      pending,
      lowStock,
      trend,
    };
  }
}
