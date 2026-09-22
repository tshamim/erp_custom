import { pgTable, varchar, text, boolean, uuid, date, integer, index, unique, time } from 'drizzle-orm/pg-core';
import { id, timestamps, money, qty } from './_common';
import { branches } from './core';

export const departments = pgTable('departments', {
  id: id(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  parentId: uuid('parent_id'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
});

export const designations = pgTable('designations', {
  id: id(),
  name: varchar('name', { length: 200 }).notNull().unique(),
  grade: varchar('grade', { length: 20 }),
  ...timestamps(),
});

export const employees = pgTable(
  'employees',
  {
    id: id(),
    code: varchar('code', { length: 30 }).notNull().unique(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }),
    fatherName: varchar('father_name', { length: 200 }),
    motherName: varchar('mother_name', { length: 200 }),
    gender: varchar('gender', { length: 10 }),
    dateOfBirth: date('date_of_birth'),
    nid: varchar('nid', { length: 30 }),
    tin: varchar('tin', { length: 30 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 200 }),
    presentAddress: text('present_address'),
    permanentAddress: text('permanent_address'),
    emergencyContactName: varchar('emergency_contact_name', { length: 200 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 50 }),
    bloodGroup: varchar('blood_group', { length: 5 }),
    departmentId: uuid('department_id').references(() => departments.id),
    designationId: uuid('designation_id').references(() => designations.id),
    branchId: uuid('branch_id').references(() => branches.id),
    managerId: uuid('manager_id'),
    employmentType: varchar('employment_type', { length: 20 }).notNull().default('permanent'),
    joiningDate: date('joining_date').notNull(),
    confirmationDate: date('confirmation_date'),
    exitDate: date('exit_date'),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active | resigned | terminated
    bankName: varchar('bank_name', { length: 100 }),
    bankAccountNo: varchar('bank_account_no', { length: 50 }),
    mobileBankingNo: varchar('mobile_banking_no', { length: 30 }), // bKash / Nagad
    dailyWage: money('daily_wage'), // daily_wage workers only
    currentProjectId: uuid('current_project_id'),
    ...timestamps(),
  },
  (t) => [index('emp_dept_idx').on(t.departmentId)],
);

export const employmentHistory = pgTable('employment_history', {
  id: id(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  effectiveDate: date('effective_date').notNull(),
  event: varchar('event', { length: 30 }).notNull(), // joined | promoted | transferred | increment | exited
  departmentId: uuid('department_id'),
  designationId: uuid('designation_id'),
  grossSalary: money('gross_salary'),
  remarks: text('remarks'),
  ...timestamps(),
});

export const attendance = pgTable(
  'attendance',
  {
    id: id(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    checkIn: time('check_in'),
    checkOut: time('check_out'),
    overtimeHours: qty('overtime_hours').notNull().default('0'),
    projectId: uuid('project_id'), // site attendance for construction workers
    remarks: text('remarks'),
    ...timestamps(),
  },
  (t) => [unique('attendance_emp_date').on(t.employeeId, t.date), index('attendance_date_idx').on(t.date)],
);

export const leaveTypes = pgTable('leave_types', {
  id: id(),
  code: varchar('code', { length: 10 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  daysPerYear: integer('days_per_year').notNull(),
  isPaid: boolean('is_paid').notNull().default(true),
  carryForward: boolean('carry_forward').notNull().default(false),
  ...timestamps(),
});

export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: id(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
    year: integer('year').notNull(),
    entitled: qty('entitled').notNull(),
    used: qty('used').notNull().default('0'),
  },
  (t) => [unique('leave_bal_uniq').on(t.employeeId, t.leaveTypeId, t.year)],
);

export const leaveRequests = pgTable('leave_requests', {
  id: id(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  days: qty('days').notNull(),
  reason: text('reason'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  decidedBy: uuid('decided_by'),
  ...timestamps(),
});

export const holidays = pgTable('holidays', {
  id: id(),
  date: date('date').notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  ...timestamps(),
});
