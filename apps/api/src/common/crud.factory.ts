import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Type } from '@nestjs/common';
import { eq, AnyColumn, SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { AnyZodObject } from 'zod';
import { listQuerySchema, ListQuery, Permission } from '@erp/shared';
import { TenantContext } from '../tenancy/tenant-context';
import { AuditService } from './audit.service';
import { Perm } from '../auth/decorators';
import { ZodPipe } from './zod';
import { paginate } from './pagination';

type TableWithId = PgTable & { id: AnyColumn };

export interface CrudOptions<T extends TableWithId> {
  path: string;
  table: T;
  schema: AnyZodObject;
  /** permission prefix, e.g. "hr.department" → hr.department.read/create/update/delete */
  perm: string;
  entity: string;
  search?: AnyColumn[];
  sortable?: Record<string, AnyColumn>;
  defaultSort?: SQL;
  filters?: (q: ListQuery) => (SQL | undefined)[];
}

/**
 * Builds a standard list/get/create/update/delete controller for simple master tables.
 * Anything with business rules gets a hand-written service instead.
 */
export function crudController<T extends TableWithId>(o: CrudOptions<T>): Type<unknown> {
  const p = (a: string) => `${o.perm}.${a}` as Permission;
  const createPipe = new ZodPipe(o.schema);
  const updatePipe = new ZodPipe(o.schema.partial());
  const listPipe = new ZodPipe(listQuerySchema);

  @Controller(o.path)
  class CrudController {
    constructor(
      readonly ctx: TenantContext,
      readonly audit: AuditService,
    ) {}

    @Get()
    @Perm(p('read'))
    list(@Query(listPipe) q: ListQuery) {
      return paginate(this.ctx.db, o.table, q, {
        search: o.search,
        sortable: o.sortable,
        defaultSort: o.defaultSort,
        where: o.filters?.(q),
      });
    }

    @Get(':id')
    @Perm(p('read'))
    async get(@Param('id', ParseUUIDPipe) id: string) {
      const [row] = await this.ctx.db.select().from(o.table as PgTable).where(eq(o.table.id, id));
      if (!row) throw new NotFoundException();
      return row;
    }

    @Post()
    @Perm(p('create'))
    async create(@Body(createPipe) dto: Record<string, unknown>) {
      const [row] = (await this.ctx.db.insert(o.table).values(dto as T['$inferInsert']).returning()) as unknown as { id: string }[];
      await this.audit.log('create', o.entity, row.id, null, row);
      return row;
    }

    @Patch(':id')
    @Perm(p('update'))
    async update(@Param('id', ParseUUIDPipe) id: string, @Body(updatePipe) dto: Record<string, unknown>) {
      const before = await this.get(id);
      const [row] = (await this.ctx.db
        .update(o.table)
        .set(dto as Partial<T['$inferInsert']>)
        .where(eq(o.table.id, id))
        .returning()) as unknown as { id: string }[];
      await this.audit.log('update', o.entity, id, before, row);
      return row;
    }

    @Delete(':id')
    @Perm(p('delete'))
    async remove(@Param('id', ParseUUIDPipe) id: string) {
      const before = await this.get(id);
      await this.ctx.db.delete(o.table).where(eq(o.table.id, id));
      await this.audit.log('delete', o.entity, id, before, null);
      return { ok: true };
    }
  }
  Object.defineProperty(CrudController, 'name', { value: `${o.entity.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase())}CrudController` });
  return CrudController;
}
