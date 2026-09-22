import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import { TenantContext } from '../../tenancy/tenant-context';
import { AuditService } from '../../common/audit.service';
import { D, m2 } from '../../common/money';

@Injectable()
export class BankService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly audit: AuditService,
  ) {}

  list() {
    const bal = sql<string>`coalesce((select sum(${t.journalLines.debit} - ${t.journalLines.credit}) from ${t.journalLines}
      join ${t.journalEntries} on ${t.journalEntries.id} = ${t.journalLines.entryId}
      where ${t.journalLines.accountId} = ${t.accounts.id} and ${t.journalEntries.status} in ('posted','reversed')), 0)`;
    return this.ctx.db
      .select({
        id: t.bankAccounts.id,
        accountId: t.accounts.id,
        accountCode: t.accounts.code,
        accountName: t.accounts.name,
        bankName: t.bankAccounts.bankName,
        branchName: t.bankAccounts.branchName,
        accountNo: t.bankAccounts.accountNo,
        routingNo: t.bankAccounts.routingNo,
        isActive: t.bankAccounts.isActive,
        balance: bal,
      })
      .from(t.bankAccounts)
      .innerJoin(t.accounts, eq(t.accounts.id, t.bankAccounts.accountId))
      .orderBy(asc(t.accounts.code));
  }

  /** Creates a GL bank account under the "Bank Accounts" group plus the bank details row. */
  async create(dto: { accountCode: string; bankName: string; branchName?: string | null; accountNo: string; routingNo?: string | null }) {
    const id = await this.ctx.db.transaction(async (tx) => {
      const [group] = await tx.select().from(t.accounts).where(eq(t.accounts.code, '1120'));
      const [acct] = await tx
        .insert(t.accounts)
        .values({
          code: dto.accountCode,
          name: `${dto.bankName} - ${dto.accountNo.slice(-4)}`,
          type: 'asset',
          subtype: 'bank',
          parentId: group?.id ?? null,
        })
        .returning({ id: t.accounts.id });
      const [bank] = await tx
        .insert(t.bankAccounts)
        .values({ accountId: acct.id, bankName: dto.bankName, branchName: dto.branchName, accountNo: dto.accountNo, routingNo: dto.routingNo })
        .returning({ id: t.bankAccounts.id });
      return bank.id;
    });
    await this.audit.log('create', 'bank_account', id, null, dto);
    return (await this.list()).find((b) => b.id === id);
  }

  private async bank(id: string) {
    const [b] = await this.ctx.db.select().from(t.bankAccounts).where(eq(t.bankAccounts.id, id));
    if (!b) throw new NotFoundException();
    return b;
  }

  /** Statement lines + unmatched ledger lines for the bank GL account, for side-by-side matching. */
  async reconciliation(id: string) {
    const b = await this.bank(id);
    const db = this.ctx.db;
    const statement = await db
      .select()
      .from(t.bankStatementLines)
      .where(eq(t.bankStatementLines.bankAccountId, id))
      .orderBy(asc(t.bankStatementLines.date));
    const matchedIds = statement.map((s) => s.matchedJournalLineId).filter((x): x is string => !!x);
    const ledger = await db
      .select({
        id: t.journalLines.id,
        date: t.journalEntries.date,
        no: t.journalEntries.no,
        reference: t.journalEntries.reference,
        narration: t.journalEntries.narration,
        amount: sql<string>`${t.journalLines.debit} - ${t.journalLines.credit}`,
      })
      .from(t.journalLines)
      .innerJoin(t.journalEntries, eq(t.journalEntries.id, t.journalLines.entryId))
      .where(and(eq(t.journalLines.accountId, b.accountId), sql`${t.journalEntries.status} in ('posted','reversed')`))
      .orderBy(asc(t.journalEntries.date));
    return {
      statement,
      unmatchedLedger: ledger.filter((l) => !matchedIds.includes(l.id)),
      unreconciledStatement: statement.filter((s) => !s.reconciledAt),
    };
  }

  async addStatementLines(id: string, lines: { date: string; description?: string | null; reference?: string | null; amount: string }[]) {
    await this.bank(id);
    const rows = await this.ctx.db
      .insert(t.bankStatementLines)
      .values(lines.map((l) => ({ ...l, bankAccountId: id, amount: m2(l.amount) })))
      .returning();
    await this.audit.log('create', 'bank_statement', id, null, { count: rows.length });
    return rows;
  }

  async match(statementLineId: string, journalLineId: string) {
    const db = this.ctx.db;
    const [s] = await db.select().from(t.bankStatementLines).where(eq(t.bankStatementLines.id, statementLineId));
    if (!s) throw new NotFoundException('Statement line not found');
    if (s.reconciledAt) throw new BadRequestException('Already reconciled');
    const [jl] = await db.select().from(t.journalLines).where(eq(t.journalLines.id, journalLineId));
    if (!jl) throw new NotFoundException('Ledger line not found');
    const b = await this.bank(s.bankAccountId);
    if (jl.accountId !== b.accountId) throw new BadRequestException('Ledger line is not on this bank account');
    if (!D(jl.debit).minus(jl.credit).equals(D(s.amount))) throw new BadRequestException('Amounts differ');
    const [already] = await db
      .select({ id: t.bankStatementLines.id })
      .from(t.bankStatementLines)
      .where(eq(t.bankStatementLines.matchedJournalLineId, journalLineId));
    if (already) throw new BadRequestException('Ledger line already matched');
    const [row] = await db
      .update(t.bankStatementLines)
      .set({ matchedJournalLineId: journalLineId, reconciledAt: new Date() })
      .where(and(eq(t.bankStatementLines.id, statementLineId), isNull(t.bankStatementLines.reconciledAt)))
      .returning();
    await this.audit.log('reconcile', 'bank_statement_line', statementLineId, null, { journalLineId });
    return row;
  }
}
