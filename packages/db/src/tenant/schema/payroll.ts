import { pgTable, varchar, uuid, date, integer, boolean, unique, text } from 'drizzle-orm/pg-core';
import { id, timestamps, money, qty, rate } from './_common';
import { employees } from './hr';
import { journalEntries } from './finance';

/** BD-style salary breakup. gross = basic + houseRent + medical + conveyance + otherAllowance. */
export const salaryStructures = pgTable('salary_structures', {
  id: id(),
  employeeId: uuid('employee_id').notNull().unique().references(() => employees.id, { onDelete: 'cascade' }),
  effectiveFrom: date('effective_from').notNull(),
  basic: money('basic').notNull(),
  houseRent: money('house_rent').notNull().default('0'),
  medical: money('medical').notNull().default('0'),
  conveyance: money('conveyance').notNull().default('0'),
  otherAllowance: money('other_allowance').notNull().default('0'),
  gross: money('gross').notNull(),
  pfPercent: rate('pf_percent').notNull().default('0'), // of basic, employee share (employer matches)
  overtimeRatePerHour: money('overtime_rate_per_hour').notNull().default('0'),
  taxEnabled: boolean('tax_enabled').notNull().default(true),
  ...timestamps(),
});

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    month: varchar('month', { length: 7 }).notNull(), // 2026-09
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    workingDays: integer('working_days').notNull(),
    includeFestivalBonus: boolean('include_festival_bonus').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | finalized
    totalGross: money('total_gross').notNull().default('0'),
    totalDeductions: money('total_deductions').notNull().default('0'),
    totalNet: money('total_net').notNull().default('0'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    ...timestamps(),
  },
  (t) => [unique('payroll_month_uniq').on(t.month)],
);

export const payslips = pgTable(
  'payslips',
  {
    id: id(),
    runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    projectId: uuid('project_id'), // labor cost center
    presentDays: qty('present_days').notNull(),
    absentDays: qty('absent_days').notNull(),
    leaveDays: qty('leave_days').notNull(),
    basic: money('basic').notNull(),
    houseRent: money('house_rent').notNull(),
    medical: money('medical').notNull(),
    conveyance: money('conveyance').notNull(),
    otherAllowance: money('other_allowance').notNull(),
    overtimeHours: qty('overtime_hours').notNull(),
    overtimeAmount: money('overtime_amount').notNull(),
    festivalBonus: money('festival_bonus').notNull(),
    gross: money('gross').notNull(),
    absentDeduction: money('absent_deduction').notNull(),
    pfEmployee: money('pf_employee').notNull(),
    pfEmployer: money('pf_employer').notNull(),
    tds: money('tds').notNull(),
    otherDeduction: money('other_deduction').notNull(),
    netPay: money('net_pay').notNull(),
    remarks: text('remarks'),
    ...timestamps(),
  },
  (t) => [unique('payslip_uniq').on(t.runId, t.employeeId)],
);
