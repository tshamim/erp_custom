import { Controller, Delete, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { listQuerySchema, vendorDocumentSchema, vendorEvaluationSchema, vendorStatusSchema } from '@erp/shared';
import { VendorsService } from './vendors.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZQuery } from '../../common/zod';

const vendorQuery = listQuerySchema.extend({ category: z.string().optional() });

@Controller()
export class VendorsController {
  constructor(private readonly svc: VendorsService) {}

  @Get('vendors')
  @Perm('vendor.vendor.read')
  list(@ZQuery(vendorQuery) q: z.infer<typeof vendorQuery>) {
    return this.svc.list(q);
  }

  @Get('vendors/categories')
  @Perm('vendor.vendor.read')
  categories() {
    return this.svc.categories();
  }

  @Get('vendors/compliance')
  @Perm('vendor.vendor.read')
  compliance() {
    return this.svc.compliance();
  }

  @Get('vendors/price-comparison/:itemId')
  @Perm('vendor.vendor.read')
  prices(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.svc.priceComparison(itemId);
  }

  @Get('vendors/:id')
  @Perm('vendor.vendor.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.view360(id);
  }

  @Post('vendors/:id/status')
  @Perm('vendor.vendor.approve')
  status(@Param('id', ParseUUIDPipe) id: string, @ZBody(vendorStatusSchema) dto: z.infer<typeof vendorStatusSchema>) {
    return this.svc.setStatus(id, dto.status, dto.reason);
  }

  @Post('vendor-evaluations')
  @Perm('vendor.evaluation.create')
  evaluate(@ZBody(vendorEvaluationSchema) dto: z.infer<typeof vendorEvaluationSchema>) {
    return this.svc.addEvaluation(dto);
  }

  @Delete('vendor-evaluations/:id')
  @Perm('vendor.evaluation.delete')
  deleteEvaluation(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteEvaluation(id);
  }

  @Post('vendor-documents')
  @Perm('vendor.vendor.update')
  addDocument(@ZBody(vendorDocumentSchema) dto: z.infer<typeof vendorDocumentSchema>) {
    return this.svc.addDocument(dto);
  }

  @Delete('vendor-documents/:id')
  @Perm('vendor.vendor.update')
  deleteDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteDocument(id);
  }
}

@Module({ controllers: [VendorsController], providers: [VendorsService] })
export class VendorsModule {}
