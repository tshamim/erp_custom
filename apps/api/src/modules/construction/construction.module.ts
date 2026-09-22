import { Module } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { tenantSchema as t } from '@erp/db';
import { equipmentSchema } from '@erp/shared';
import { crudController } from '../../common/crud.factory';
import { FinanceModule } from '../finance/finance.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { ProjectsService } from './projects.service';
import { SiteService } from './site.service';
import {
  ProjectsController,
  RaBillsController,
  SiteOpsController,
  SiteRequisitionsController,
  WorkOrdersController,
} from './construction.controller';

const EquipmentController = crudController({
  path: 'equipment',
  table: t.equipment,
  schema: equipmentSchema,
  perm: 'construction.equipment',
  entity: 'equipment',
  search: [t.equipment.code, t.equipment.name, t.equipment.type],
  defaultSort: asc(t.equipment.code),
});

@Module({
  imports: [FinanceModule, ProcurementModule],
  controllers: [ProjectsController, SiteRequisitionsController, WorkOrdersController, RaBillsController, SiteOpsController, EquipmentController],
  providers: [ProjectsService, SiteService],
  exports: [ProjectsService],
})
export class ConstructionModule {}
