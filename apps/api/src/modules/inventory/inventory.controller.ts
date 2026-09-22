import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { itemSchema, ItemDto, listQuerySchema, ListQuery, stockDocumentSchema, StockDocumentDto } from '@erp/shared';
import { ItemsService, StockDocumentsService } from './inventory.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';

const postFlag = new ZodPipe(z.enum(['true', 'false']).default('false').transform((v) => v === 'true'));
const itemQuery = listQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  lowStock: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

@Controller('items')
export class ItemsController {
  constructor(private readonly svc: ItemsService) {}

  @Get()
  @Perm('inventory.item.read')
  list(@ZQuery(itemQuery) q: z.infer<typeof itemQuery>) {
    return this.svc.list(q);
  }

  @Get('pick')
  pick() {
    return this.svc.pick();
  }

  @Get(':id')
  @Perm('inventory.item.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Perm('inventory.item.create')
  create(@ZBody(itemSchema) dto: ItemDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Perm('inventory.item.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(itemSchema.partial())) dto: Partial<ItemDto>) {
    return this.svc.update(id, dto);
  }
}

@Controller('stock')
export class StockController {
  constructor(private readonly svc: StockDocumentsService) {}

  @Get('balances')
  @Perm('inventory.report.read')
  balances(@Query() q: { warehouseId?: string; itemId?: string; search?: string }) {
    return this.svc.balances(q);
  }

  @Get('ledger')
  @Perm('inventory.report.read')
  ledger(@Query() q: { itemId?: string; warehouseId?: string; projectId?: string; from?: string; to?: string }) {
    return this.svc.ledger(q);
  }

  @Get('documents')
  @Perm('inventory.movement.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.list(q);
  }

  @Get('documents/:id')
  @Perm('inventory.movement.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post('documents')
  @Perm('inventory.movement.create')
  create(@ZBody(stockDocumentSchema) dto: StockDocumentDto, @Query('post', postFlag) post: boolean) {
    return this.svc.create(dto, post);
  }

  @Post('documents/:id/post')
  @Perm('inventory.movement.create')
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.post(id);
  }

  @Delete('documents/:id')
  @Perm('inventory.movement.delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }
}
