import { Module } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { tenantSchema as t } from '@erp/db';
import { warehouseSchema } from '@erp/shared';
import { crudController } from '../../common/crud.factory';
import { ItemsService, StockDocumentsService } from './inventory.service';
import { ItemsController, StockController } from './inventory.controller';

const WarehousesController = crudController({
  path: 'warehouses',
  table: t.warehouses,
  schema: warehouseSchema,
  perm: 'inventory.warehouse',
  entity: 'warehouse',
  search: [t.warehouses.code, t.warehouses.name],
  defaultSort: asc(t.warehouses.code),
});

const UomsController = crudController({
  path: 'uoms',
  table: t.uoms,
  schema: z.object({ code: z.string().min(1).max(20), name: z.string().min(1).max(100) }),
  perm: 'inventory.item',
  entity: 'uom',
  search: [t.uoms.code, t.uoms.name],
  defaultSort: asc(t.uoms.code),
});

const CategoriesController = crudController({
  path: 'item-categories',
  table: t.itemCategories,
  schema: z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(2).max(200),
    parentId: z.string().uuid().nullish(),
    inventoryAccountId: z.string().uuid().nullish(),
    expenseAccountId: z.string().uuid().nullish(),
  }),
  perm: 'inventory.item',
  entity: 'item_category',
  search: [t.itemCategories.code, t.itemCategories.name],
  defaultSort: asc(t.itemCategories.code),
});

@Module({
  controllers: [ItemsController, StockController, WarehousesController, UomsController, CategoriesController],
  providers: [ItemsService, StockDocumentsService],
  exports: [StockDocumentsService],
})
export class InventoryModule {}
