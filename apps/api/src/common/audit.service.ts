import { Injectable, Logger } from '@nestjs/common';
import { tenantSchema as t, TenantDb } from '@erp/db';
import { TenantContext } from '../tenancy/tenant-context';

const REDACT = new Set(['passwordHash', 'password', 'dbPasswordEnc']);

function clean(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v ?? null;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !REDACT.has(k)));
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly ctx: TenantContext) {}

  /** Records an audit row. Pass `db` = transaction to make the audit atomic with the change. */
  async log(
    action: string,
    entity: string,
    entityId: string | null | undefined,
    before?: unknown,
    after?: unknown,
    db: TenantDb = this.ctx.db,
  ) {
    try {
      await db.insert(t.auditLogs).values({
        userId: this.ctx.userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        before: clean(before),
        after: clean(after),
        ip: this.ctx.ip ?? null,
        impersonatedBy: this.ctx.impersonator ?? null,
      });
    } catch (e) {
      // Audit must never break the business operation outside a transaction.
      if (db !== this.ctx.db) throw e;
      this.logger.error(`audit failed: ${(e as Error).message}`);
    }
  }
}
