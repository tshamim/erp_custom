import { and, asc, desc, ilike, or, sql, SQL, AnyColumn } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { ListQuery, Paginated } from '@erp/shared';
import type { TenantDb } from '@erp/db';

export interface ListOptions {
  search?: AnyColumn[];
  sortable?: Record<string, AnyColumn>;
  defaultSort?: SQL;
  where?: (SQL | undefined)[];
}

export function searchClause(q: ListQuery, cols: AnyColumn[] = []): SQL | undefined {
  if (!q.search || !cols.length) return undefined;
  const term = `%${q.search.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  return or(...cols.map((c) => ilike(c, term)));
}

export function orderClause(q: ListQuery, opts: ListOptions): SQL | undefined {
  if (q.sort && opts.sortable) {
    const descending = q.sort.startsWith('-');
    const col = opts.sortable[q.sort.replace(/^-/, '')];
    if (col) return descending ? desc(col) : asc(col);
  }
  return opts.defaultSort;
}

/** Generic single-table pagination. For joins, build the query manually and use `countOf`. */
export async function paginate<T extends PgTable>(
  db: TenantDb,
  table: T,
  q: ListQuery,
  opts: ListOptions = {},
): Promise<Paginated<T['$inferSelect']>> {
  const where = and(searchClause(q, opts.search), ...(opts.where ?? []));
  const order = orderClause(q, opts);
  const base = db.select().from(table as PgTable).where(where).$dynamic();
  const data = await (order ? base.orderBy(order) : base).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table as PgTable)
    .where(where);
  return { data: data as T['$inferSelect'][], total: count, page: q.page, pageSize: q.pageSize };
}

export async function countOf(db: TenantDb, table: PgTable, where?: SQL): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(where);
  return count;
}
