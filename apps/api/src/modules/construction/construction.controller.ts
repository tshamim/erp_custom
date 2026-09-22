import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  boqItemSchema,
  BoqItemDto,
  dprSchema,
  DprDto,
  equipmentLogSchema,
  leaveDecisionSchema,
  listQuerySchema,
  ListQuery,
  projectBudgetSchema,
  projectSchema,
  ProjectDto,
  projectTaskSchema,
  ProjectTaskDto,
  raBillSchema,
  RaBillDto,
  siteRequisitionSchema,
  SiteRequisitionDto,
  subcontractBillSchema,
  SubcontractBillDto,
  variationOrderSchema,
  workOrderSchema,
  WorkOrderDto,
} from '@erp/shared';
import { ProjectsService } from './projects.service';
import { SiteService } from './site.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly site: SiteService,
  ) {}

  @Get()
  @Perm('construction.project.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.projects.list(q);
  }

  @Get(':id')
  @Perm('construction.project.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.get(id);
  }

  @Get(':id/summary')
  @Perm('construction.project.read')
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.summary(id);
  }

  @Post()
  @Perm('construction.project.create')
  create(@ZBody(projectSchema) dto: ProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  @Perm('construction.project.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(projectSchema.partial())) dto: Partial<ProjectDto>) {
    return this.projects.update(id, dto);
  }

  @Put(':id/budgets')
  @Perm('construction.project.update')
  budgets(@Param('id', ParseUUIDPipe) id: string, @ZBody(projectBudgetSchema) dto: z.infer<typeof projectBudgetSchema>) {
    return this.projects.setBudgets(id, dto.budgets);
  }

  // BOQ
  @Get(':id/boq')
  @Perm('construction.boq.read')
  boq(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.boq(id);
  }

  @Get(':id/boq/materials')
  @Perm('construction.boq.read')
  materialEstimate(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.materialEstimate(id);
  }

  @Get(':id/boq/:itemId')
  @Perm('construction.boq.read')
  boqItem(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.projects.boqItem(itemId);
  }

  @Post(':id/boq')
  @Perm('construction.boq.create')
  addBoq(@Param('id', ParseUUIDPipe) id: string, @ZBody(boqItemSchema) dto: BoqItemDto) {
    return this.projects.saveBoqItem(id, null, dto);
  }

  @Put(':id/boq/:itemId')
  @Perm('construction.boq.update')
  updateBoq(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @ZBody(boqItemSchema) dto: BoqItemDto) {
    return this.projects.saveBoqItem(id, itemId, dto);
  }

  @Delete(':id/boq/:itemId')
  @Perm('construction.boq.delete')
  deleteBoq(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.projects.deleteBoqItem(itemId);
  }

  // Tasks
  @Get(':id/tasks')
  @Perm('construction.task.read')
  tasks(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.tasks(id);
  }

  @Post(':id/tasks')
  @Perm('construction.task.create')
  addTask(@Param('id', ParseUUIDPipe) id: string, @ZBody(projectTaskSchema) dto: ProjectTaskDto) {
    return this.projects.saveTask(id, null, dto);
  }

  @Put(':id/tasks/:taskId')
  @Perm('construction.task.update')
  updateTask(@Param('id', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) taskId: string, @ZBody(projectTaskSchema) dto: ProjectTaskDto) {
    return this.projects.saveTask(id, taskId, dto);
  }

  @Delete(':id/tasks/:taskId')
  @Perm('construction.task.delete')
  deleteTask(@Param('id', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.projects.deleteTask(id, taskId);
  }

  // DPR
  @Get(':id/dpr')
  @Perm('construction.dpr.read')
  dpr(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.listDpr(id);
  }

  // Variations
  @Get(':id/variations')
  @Perm('construction.project.read')
  variations(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.listVariations(id);
  }
}

@Controller('site-requisitions')
export class SiteRequisitionsController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @Perm('construction.requisition.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.site.listRequisitions(q);
  }

  @Get(':id')
  @Perm('construction.requisition.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.getRequisition(id);
  }

  @Post()
  @Perm('construction.requisition.create')
  create(@ZBody(siteRequisitionSchema) dto: SiteRequisitionDto) {
    return this.site.createRequisition(dto);
  }

  @Post(':id/submit')
  @Perm('construction.requisition.update')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.setRequisitionStatus(id, 'submitted');
  }

  @Post(':id/approve')
  @Perm('construction.requisition.update')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.setRequisitionStatus(id, 'approved');
  }

  @Post(':id/reject')
  @Perm('construction.requisition.update')
  reject(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.setRequisitionStatus(id, 'rejected');
  }

  @Post(':id/purchase-requisition')
  @Perm('procurement.requisition.create')
  toPr(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.toPurchaseRequisition(id);
  }
}

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @Perm('construction.subcontract.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.site.listWorkOrders(q);
  }

  @Get(':id')
  @Perm('construction.subcontract.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.getWorkOrder(id);
  }

  @Post()
  @Perm('construction.subcontract.create')
  create(@ZBody(workOrderSchema) dto: WorkOrderDto) {
    return this.site.createWorkOrder(dto);
  }

  @Post('bills')
  @Perm('construction.subcontract.update')
  bill(@ZBody(subcontractBillSchema) dto: SubcontractBillDto) {
    return this.site.createSubcontractBill(dto);
  }
}

@Controller('ra-bills')
export class RaBillsController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @Perm('construction.rabill.read')
  list(@ZQuery(listQuerySchema) q: ListQuery) {
    return this.site.listRaBills(q);
  }

  @Get(':id')
  @Perm('construction.rabill.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.getRaBill(id);
  }

  @Post()
  @Perm('construction.rabill.create')
  create(@ZBody(raBillSchema) dto: RaBillDto) {
    return this.site.createRaBill(dto);
  }

  @Post(':id/approve')
  @Perm('construction.rabill.approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.approveRaBill(id);
  }

  @Post(':id/cancel')
  @Perm('construction.rabill.delete')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.site.cancelRaBill(id);
  }
}

@Controller()
export class SiteOpsController {
  constructor(private readonly site: SiteService) {}

  @Post('dpr')
  @Perm('construction.dpr.create')
  saveDpr(@ZBody(dprSchema) dto: DprDto) {
    return this.site.saveDpr(dto);
  }

  @Get('equipment-logs')
  @Perm('construction.equipment.read')
  logs(@Query() q: { projectId?: string; equipmentId?: string }) {
    return this.site.equipmentLogs(q);
  }

  @Post('equipment-logs')
  @Perm('construction.equipment.create')
  log(@ZBody(equipmentLogSchema) dto: z.infer<typeof equipmentLogSchema>) {
    return this.site.logEquipment(dto);
  }

  @Post('variations')
  @Perm('construction.project.update')
  createVariation(@ZBody(variationOrderSchema) dto: z.infer<typeof variationOrderSchema>) {
    return this.site.createVariation(dto);
  }

  @Post('variations/:id/decision')
  @Perm('construction.project.update')
  decide(@Param('id', ParseUUIDPipe) id: string, @ZBody(leaveDecisionSchema) dto: z.infer<typeof leaveDecisionSchema>) {
    return this.site.decideVariation(id, dto.status);
  }
}
