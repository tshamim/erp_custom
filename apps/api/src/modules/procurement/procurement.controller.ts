import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  goodsReceiptSchema,
  GoodsReceiptDto,
  listQuerySchema,
  ListQuery,
  purchaseOrderSchema,
  PurchaseOrderDto,
  purchaseRequisitionSchema,
  PurchaseRequisitionDto,
  zx,
} from '@erp/shared';
import { ProcurementService } from './procurement.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZQuery } from '../../common/zod';

const quotationSchema = z.object({
  requisitionId: zx.uuid,
  partyId: zx.uuid,
  quoteRef: z.string().nullish(),
  date: zx.isoDate,
  validUntil: zx.isoDate.nullish(),
  lines: z
    .array(z.object({ itemId: zx.uuid, quantity: zx.positiveDecimal, unitPrice: zx.nonNegDecimal, deliveryDays: z.coerce.number().int().nullish() }))
    .min(1),
});

@Controller('purchase-requisitions')
export class RequisitionsController {
  constructor(private readonly svc: ProcurementService) {}

  @Get()
  @Perm('procurement.requisition.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.listRequisitions(q);
  }

  @Get(':id')
  @Perm('procurement.requisition.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getRequisition(id);
  }

  @Post()
  @Perm('procurement.requisition.create')
  create(@ZBody(purchaseRequisitionSchema) dto: PurchaseRequisitionDto) {
    return this.svc.createRequisition(dto);
  }

  @Post(':id/submit')
  @Perm('procurement.requisition.update')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setRequisitionStatus(id, 'submitted');
  }

  @Post(':id/approve')
  @Perm('procurement.order.approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setRequisitionStatus(id, 'approved');
  }

  @Post(':id/reject')
  @Perm('procurement.order.approve')
  reject(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setRequisitionStatus(id, 'rejected');
  }

  @Post('quotations')
  @Perm('procurement.order.create')
  addQuotation(@ZBody(quotationSchema) dto: z.infer<typeof quotationSchema>) {
    return this.svc.addQuotation(dto);
  }
}

@Controller('purchase-orders')
export class OrdersController {
  constructor(private readonly svc: ProcurementService) {}

  @Get()
  @Perm('procurement.order.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.listOrders(q);
  }

  @Get(':id')
  @Perm('procurement.order.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getOrder(id);
  }

  @Post()
  @Perm('procurement.order.create')
  create(@ZBody(purchaseOrderSchema) dto: PurchaseOrderDto) {
    return this.svc.createOrder(dto);
  }

  @Post(':id/approve')
  @Perm('procurement.order.approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setOrderStatus(id, 'approved');
  }

  @Post(':id/cancel')
  @Perm('procurement.order.delete')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setOrderStatus(id, 'cancelled');
  }

  @Post(':id/close')
  @Perm('procurement.order.update')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setOrderStatus(id, 'closed');
  }
}

@Controller('goods-receipts')
export class ReceiptsController {
  constructor(private readonly svc: ProcurementService) {}

  @Get()
  @Perm('procurement.receipt.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.svc.listReceipts(q);
  }

  @Get(':id')
  @Perm('procurement.receipt.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getReceipt(id);
  }

  @Post()
  @Perm('procurement.receipt.create')
  receive(@ZBody(goodsReceiptSchema) dto: GoodsReceiptDto) {
    return this.svc.receive(dto);
  }
}
