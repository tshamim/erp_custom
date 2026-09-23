import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { controlSchema as c } from '@erp/db';
import { MODULE_KEYS, ModuleKey, moduleOf } from '@erp/shared';
import { CONTROL_DB, ControlDb } from '../control/control.module';

const TTL_MS = 30_000;

/** Which licensed modules a tenant has. Cached 30s; `invalidate` after the platform owner changes them. */
@Injectable()
export class TenantModulesService {
  private readonly cache = new Map<string, { modules: Set<ModuleKey>; at: number }>();

  constructor(@Inject(CONTROL_DB) private readonly control: ControlDb) {}

  async enabled(tenantId: string): Promise<Set<ModuleKey>> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.modules;
    const rows = await this.control
      .select({ module: c.tenantModules.module })
      .from(c.tenantModules)
      .where(and(eq(c.tenantModules.tenantId, tenantId), eq(c.tenantModules.enabled, true)));
    const modules = new Set(rows.map((r) => r.module as ModuleKey).filter((m) => MODULE_KEYS.includes(m)));
    this.cache.set(tenantId, { modules, at: Date.now() });
    return modules;
  }

  /** Drops permissions that belong to modules the tenant is not licensed for. */
  async filterPermissions(tenantId: string, keys: Iterable<string>): Promise<Set<string>> {
    const on = await this.enabled(tenantId);
    return new Set([...keys].filter((k) => {
      const m = moduleOf(k);
      return m === null || on.has(m);
    }));
  }

  async set(tenantId: string, modules: Partial<Record<ModuleKey, boolean>>) {
    for (const [module, enabled] of Object.entries(modules)) {
      if (!MODULE_KEYS.includes(module as ModuleKey)) continue;
      await this.control
        .insert(c.tenantModules)
        .values({ tenantId, module, enabled: !!enabled })
        .onConflictDoUpdate({ target: [c.tenantModules.tenantId, c.tenantModules.module], set: { enabled: !!enabled, updatedAt: new Date() } });
    }
    this.cache.delete(tenantId);
  }
}
