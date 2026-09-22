import { Module } from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { OrdersController, ReceiptsController, RequisitionsController } from './procurement.controller';

@Module({
  controllers: [RequisitionsController, OrdersController, ReceiptsController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
