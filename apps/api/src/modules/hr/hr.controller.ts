import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  attendanceBulkSchema,
  AttendanceBulkDto,
  employeeSchema,
  EmployeeDto,
  leaveDecisionSchema,
  leaveRequestSchema,
  LeaveRequestDto,
  listQuerySchema,
} from '@erp/shared';
import { EmployeesService } from './employees.service';
import { AttendanceLeaveService } from './attendance-leave.service';
import { Perm } from '../../auth/decorators';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';

const employeeQuery = listQuerySchema.extend({
  departmentId: z.string().uuid().optional(),
  employmentType: z.string().optional(),
});
const monthRe = /^\d{4}-\d{2}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Perm('hr.employee.read')
  list(@ZQuery(employeeQuery) q: z.infer<typeof employeeQuery>) {
    return this.employees.list(q);
  }

  @Get('pick')
  pick() {
    return this.employees.pick();
  }

  @Get(':id')
  @Perm('hr.employee.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(id);
  }

  @Post()
  @Perm('hr.employee.create')
  create(@ZBody(employeeSchema) dto: EmployeeDto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  @Perm('hr.employee.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(employeeSchema.partial())) dto: Partial<EmployeeDto>) {
    return this.employees.update(id, dto);
  }
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceLeaveService) {}

  @Get()
  @Perm('hr.attendance.read')
  sheet(@Query('date', new ZodPipe(z.string().regex(dateRe))) date: string, @Query('projectId') projectId?: string) {
    return this.svc.sheet(date, projectId || undefined);
  }

  @Post()
  @Perm('hr.attendance.create')
  save(@ZBody(attendanceBulkSchema) dto: AttendanceBulkDto) {
    return this.svc.saveBulk(dto);
  }

  @Get('summary')
  @Perm('hr.attendance.read')
  summary(@Query('month', new ZodPipe(z.string().regex(monthRe))) month: string, @Query('projectId') projectId?: string) {
    return this.svc.monthlySummary(month, projectId || undefined);
  }
}

const leaveQuery = listQuerySchema.extend({ employeeId: z.string().uuid().optional() });

@Controller('leave')
export class LeaveController {
  constructor(private readonly svc: AttendanceLeaveService) {}

  @Get('requests')
  @Perm('hr.leave.read')
  list(@ZQuery(leaveQuery) q: z.infer<typeof leaveQuery>) {
    return this.svc.listRequests(q);
  }

  @Post('requests')
  @Perm('hr.leave.create')
  create(@ZBody(leaveRequestSchema) dto: LeaveRequestDto) {
    return this.svc.requestLeave(dto);
  }

  @Post('requests/:id/decision')
  @Perm('hr.leave.approve')
  decide(@Param('id', ParseUUIDPipe) id: string, @ZBody(leaveDecisionSchema) dto: z.infer<typeof leaveDecisionSchema>) {
    return this.svc.decide(id, dto.status);
  }

  @Get('balances/:employeeId')
  @Perm('hr.leave.read')
  balances(@Param('employeeId', ParseUUIDPipe) employeeId: string, @Query('year') year?: string) {
    return this.svc.balances(employeeId, year ? Number(year) : undefined);
  }
}
