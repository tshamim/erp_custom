import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { TenantDb } from '@erp/db';
import type { ResolvedTenant } from './tenant-connection.service';

/** CLS keys (kept untyped on ClsService — typing the store with TenantDb blows up TS inference). */
export const CLS = { tenant: 'tenant', tenantDb: 'tenantDb', userId: 'userId', ip: 'ip', impersonator: 'impersonator' } as const;

/**
 * Request-scoped tenant access backed by AsyncLocalStorage (nestjs-cls),
 * so services stay singletons while still reaching the current tenant's DB.
 */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  get db(): TenantDb {
    const db = this.cls.get(CLS.tenantDb) as TenantDb | undefined;
    if (!db) throw new ForbiddenException('No company selected (send X-Tenant header or use a company subdomain)');
    return db;
  }

  get tenant(): ResolvedTenant {
    const t = this.cls.get(CLS.tenant) as ResolvedTenant | undefined;
    if (!t) throw new ForbiddenException('No company selected');
    return t;
  }

  get tenantOrNull(): ResolvedTenant | undefined {
    return this.cls.get(CLS.tenant) as ResolvedTenant | undefined;
  }

  get userId(): string | undefined {
    return this.cls.get(CLS.userId) as string | undefined;
  }

  get ip(): string | undefined {
    return this.cls.get(CLS.ip) as string | undefined;
  }

  /** Platform admin email when the current request runs under "login as tenant". */
  get impersonator(): string | undefined {
    return this.cls.get(CLS.impersonator) as string | undefined;
  }

  setUser(userId: string, impersonator?: string) {
    this.cls.set(CLS.userId, userId);
    if (impersonator) this.cls.set(CLS.impersonator, impersonator);
  }

  /** Bind a tenant outside the HTTP middleware (platform operations on a specific tenant). */
  bindTenant(tenant: ResolvedTenant, db: TenantDb) {
    this.cls.set(CLS.tenant, tenant);
    this.cls.set(CLS.tenantDb, db);
  }
}
