import { Module } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { tenantSchema as t } from '@erp/db';
import { departmentSchema, designationSchema, zx } from '@erp/shared';
import { crudController } from '../../common/crud.factory';
import { EmployeesController, AttendanceController, LeaveController } from './hr.controller';
import { EmployeesService } from './employees.service';
import { AttendanceLeaveService } from './attendance-leave.service';

const DepartmentsController = crudController({
  path: 'departments',
  table: t.departments,
  schema: departmentSchema,
  perm: 'hr.department',
  entity: 'department',
  search: [t.departments.code, t.departments.name],
  defaultSort: asc(t.departments.code),
});

const DesignationsController = crudController({
  path: 'designations',
  table: t.designations,
  schema: designationSchema,
  perm: 'hr.designation',
  entity: 'designation',
  search: [t.designations.name],
  defaultSort: asc(t.designations.name),
});

const HolidaysController = crudController({
  path: 'holidays',
  table: t.holidays,
  schema: z.object({ date: zx.isoDate, name: z.string().min(2) }),
  perm: 'hr.attendance',
  entity: 'holiday',
  search: [t.holidays.name],
  defaultSort: asc(t.holidays.date),
});

const LeaveTypesController = crudController({
  path: 'leave-types',
  table: t.leaveTypes,
  schema: z.object({
    code: z.string().min(1).max(10),
    name: z.string().min(2),
    daysPerYear: z.coerce.number().int().min(0),
    isPaid: z.boolean().default(true),
    carryForward: z.boolean().default(false),
  }),
  perm: 'hr.leave',
  entity: 'leave_type',
  defaultSort: asc(t.leaveTypes.code),
});

@Module({
  controllers: [
    EmployeesController,
    AttendanceController,
    LeaveController,
    DepartmentsController,
    DesignationsController,
    HolidaysController,
    LeaveTypesController,
  ],
  providers: [EmployeesService, AttendanceLeaveService],
  exports: [EmployeesService, AttendanceLeaveService],
})
export class HrModule {}
