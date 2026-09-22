import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { tenantSchema as t, TenantDb } from '@erp/db';

const TTL_MS = 60_000;

/** Caches each user's effective permission set for 60s. Call `invalidate` after role changes. */
@Injectable()
export class PermissionCache {
  private readonly cache = new Map<string, { keys: Set<string>; active: boolean; at: number }>();

  async forUser(tenantId: string, userId: string, db: TenantDb) {
    const k = `${tenantId}:${userId}`;
    const hit = this.cache.get(k);
    if (hit && Date.now() - hit.at < TTL_MS) return hit;

    const [user] = await db.select({ isActive: t.users.isActive }).from(t.users).where(eq(t.users.id, userId));
    const rows = await db
      .selectDistinct({ key: t.rolePermissions.permissionKey })
      .from(t.userRoles)
      .innerJoin(t.rolePermissions, eq(t.rolePermissions.roleId, t.userRoles.roleId))
      .where(eq(t.userRoles.userId, userId));
    const entry = { keys: new Set(rows.map((r) => r.key)), active: !!user?.isActive, at: Date.now() };
    this.cache.set(k, entry);
    return entry;
  }

  invalidate(tenantId: string, userId?: string) {
    for (const k of this.cache.keys()) {
      if (userId ? k === `${tenantId}:${userId}` : k.startsWith(`${tenantId}:`)) this.cache.delete(k);
    }
  }
}
