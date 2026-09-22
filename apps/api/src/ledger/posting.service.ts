import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';
import { NumberingService } from '../common/numbering.service';
import { TenantContext } from '../tenancy/tenant-context';
import { D, Decimal, m2, Num } from '../common/money';

/** A line references an account either by posting-role key ("ap", "inventory"...) or by id. */
export interface PostLine {
  account: string | { id: string };
  debit?: Num;
  credit?: Num;
  partyId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  description?: string | null;
}

export interface PostRequest {
  date: string;
  sourceType: string;
  sourceId?: string | null;
  narration?: string | null;
  reference?: string | null;
  lines: PostLine[];
}

export interface NormalizedLine extends Omit<PostLine, 'debit' | 'credit'> {
  debit: Decimal;
  credit: Decimal;
}

/**
 * Normalizes lines (negative amounts flip sides, zero lines dropped) and checks the entry balances.
 * Pure — unit-tested separately.
 */
export function normalizeLines(lines: PostLine[]): NormalizedLine[] {
  const out: NormalizedLine[] = [];
  for (const l of lines) {
    const net = D(l.debit).minus(D(l.credit)).toDecimalPlaces(2);
    if (net.isZero()) continue;
    out.push({ ...l, debit: net.isPositive() ? net : new Decimal(0), credit: net.isNegative() ? net.abs() : new Decimal(0) });
  }
  if (out.length < 2) throw new BadRequestException('Journal entry needs at least two non-zero lines');
  const dr = out.reduce((a, l) => a.plus(l.debit), new Decimal(0));
  const cr = out.reduce((a, l) => a.plus(l.credit), new Decimal(0));
  if (!dr.equals(cr)) throw new BadRequestException(`Entry not balanced: debit ${dr.toFixed(2)} ≠ credit ${cr.toFixed(2)}`);
  return out;
}

/**
 * The single gateway to the general ledger. Every module posts through here so that
 * balancing, period locks and account validation are enforced in one place.
 */
@Injectable()
export class PostingService {
  constructor(
    private readonly numbering: NumberingService,
    private readonly ctx: TenantContext,
  ) {}

  async assertOpenPeriod(db: TenantDb, date: string) {
    const [period] = await db
      .select()
      .from(t.fiscalPeriods)
      .where(and(lte(t.fiscalPeriods.startDate, date), gte(t.fiscalPeriods.endDate, date)));
    if (!period) throw new BadRequestException(`No fiscal period defined for ${date}. Create the fiscal year first.`);
    if (period.isLocked) throw new BadRequestException(`Fiscal period ${period.name} is locked`);
  }

  async resolveAccounts(db: TenantDb, lines: { account: string | { id: string } }[]): Promise<string[]> {
    const keys = [...new Set(lines.filter((l) => typeof l.account === 'string').map((l) => l.account as string))];
    const map = new Map<string, string>();
    if (keys.length) {
      const rows = await db.select().from(t.accountMappings).where(inArray(t.accountMappings.key, keys));
      rows.forEach((r) => map.set(r.key, r.accountId));
      const missing = keys.filter((k) => !map.has(k));
      if (missing.length) throw new BadRequestException(`Account mapping missing for: ${missing.join(', ')}`);
    }
    const ids = lines.map((l) => (typeof l.account === 'string' ? map.get(l.account)! : l.account.id));
    const accts = await db
      .select({ id: t.accounts.id, isGroup: t.accounts.isGroup, isActive: t.accounts.isActive, code: t.accounts.code })
      .from(t.accounts)
      .where(inArray(t.accounts.id, [...new Set(ids)]));
    const byId = new Map(accts.map((a) => [a.id, a]));
    for (const id of ids) {
      const a = byId.get(id);
      if (!a) throw new BadRequestException(`Account ${id} not found`);
      if (a.isGroup) throw new BadRequestException(`Account ${a.code} is a group account and cannot be posted to`);
      if (!a.isActive) throw new BadRequestException(`Account ${a.code} is inactive`);
    }
    return ids;
  }

  /** Creates and posts a journal entry inside `db` (pass the caller's transaction). Returns entry id. */
  async post(db: TenantDb, req: PostRequest): Promise<string> {
    const lines = normalizeLines(req.lines);
    await this.assertOpenPeriod(db, req.date);
    const accountIds = await this.resolveAccounts(db, lines);
    const total = lines.reduce((a, l) => a.plus(l.debit), new Decimal(0));
    const no = await this.numbering.next(db, 'journal', req.date);
    const [entry] = await db
      .insert(t.journalEntries)
      .values({
        no,
        date: req.date,
        reference: req.reference ?? null,
        narration: req.narration ?? null,
        sourceType: req.sourceType,
        sourceId: req.sourceId ?? null,
        status: 'posted',
        totalDebit: m2(total),
        totalCredit: m2(total),
        postedAt: new Date(),
        postedBy: this.ctx.userId ?? null,
        createdBy: this.ctx.userId ?? null,
      })
      .returning({ id: t.journalEntries.id });
    await db.insert(t.journalLines).values(
      lines.map((l, i) => ({
        entryId: entry.id,
        lineNo: i + 1,
        accountId: accountIds[i],
        debit: m2(l.debit),
        credit: m2(l.credit),
        partyId: l.partyId ?? null,
        projectId: l.projectId ?? null,
        departmentId: l.departmentId ?? null,
        description: l.description ?? null,
      })),
    );
    return entry.id;
  }

  /** Posts a mirror entry and marks the original reversed. */
  async reverse(db: TenantDb, entryId: string, date: string, narration?: string): Promise<string> {
    const [orig] = await db.select().from(t.journalEntries).where(eq(t.journalEntries.id, entryId));
    if (!orig) throw new BadRequestException('Journal entry not found');
    if (orig.status !== 'posted') throw new BadRequestException(`Cannot reverse a ${orig.status} entry`);
    const lines = await db.select().from(t.journalLines).where(eq(t.journalLines.entryId, entryId));
    const id = await this.post(db, {
      date,
      sourceType: orig.sourceType,
      sourceId: orig.sourceId,
      reference: orig.no,
      narration: narration ?? `Reversal of ${orig.no}`,
      lines: lines.map((l) => ({
        account: { id: l.accountId },
        debit: l.credit,
        credit: l.debit,
        partyId: l.partyId,
        projectId: l.projectId,
        departmentId: l.departmentId,
        description: l.description,
      })),
    });
    await db.update(t.journalEntries).set({ status: 'reversed' }).where(eq(t.journalEntries.id, entryId));
    await db.update(t.journalEntries).set({ reversalOfId: entryId }).where(eq(t.journalEntries.id, id));
    return id;
  }
}
