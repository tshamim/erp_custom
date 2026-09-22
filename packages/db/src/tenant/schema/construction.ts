import { pgTable, varchar, text, uuid, date, integer, index, unique, boolean, jsonb } from 'drizzle-orm/pg-core';
import { id, timestamps, money, qty, rate } from './_common';
import { parties, invoices, bills } from './finance';
import { items } from './inventory';
import { employees } from './hr';

export const projects = pgTable(
  'projects',
  {
    id: id(),
    code: varchar('code', { length: 30 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    clientId: uuid('client_id').references(() => parties.id),
    contractNo: varchar('contract_no', { length: 100 }),
    contractValue: money('contract_value').notNull().default('0'),
    location: text('location'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    actualEndDate: date('actual_end_date'),
    status: varchar('status', { length: 20 }).notNull().default('planning'),
    projectManagerId: uuid('project_manager_id').references(() => employees.id),
    retentionPercent: rate('retention_percent').notNull().default('0'),
    mobilizationAdvance: money('mobilization_advance').notNull().default('0'),
    advanceRecoveryPercent: rate('advance_recovery_percent').notNull().default('0'),
    vatPercent: rate('vat_percent').notNull().default('0'), // construction services VAT (e.g. 7.5)
    description: text('description'),
    ...timestamps(),
  },
  (t) => [index('projects_client_idx').on(t.clientId)],
);

export const projectSites = pgTable('project_sites', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  address: text('address'),
  inChargeId: uuid('in_charge_id').references(() => employees.id),
  ...timestamps(),
});

/** Bill of Quantities. Sections (isSection) group items; amount = quantity × rate. */
export const boqItems = pgTable(
  'boq_items',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    code: varchar('code', { length: 30 }).notNull(), // 1.2.3
    description: text('description').notNull(),
    uom: varchar('uom', { length: 20 }),
    quantity: qty('quantity').notNull().default('0'),
    rate: money('rate').notNull().default('0'),
    amount: money('amount').notNull().default('0'),
    isSection: boolean('is_section').notNull().default(false),
    executedQty: qty('executed_qty').notNull().default('0'), // cumulative billed to client
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [unique('boq_code_uniq').on(t.projectId, t.code)],
);

/** Rate analysis: material consumption per unit of BOQ item. */
export const boqItemMaterials = pgTable('boq_item_materials', {
  id: id(),
  boqItemId: uuid('boq_item_id').notNull().references(() => boqItems.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id),
  qtyPerUnit: qty('qty_per_unit').notNull(),
  wastagePercent: rate('wastage_percent').notNull().default('0'),
});

export const projectBudgets = pgTable(
  'project_budgets',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 20 }).notNull(), // material | labor | subcontract | equipment | overhead
    amount: money('amount').notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [unique('budget_uniq').on(t.projectId, t.category)],
);

export const projectTasks = pgTable('project_tasks', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  progress: rate('progress').notNull().default('0'), // 0..100
  weight: rate('weight').notNull().default('1'),
  status: varchar('status', { length: 20 }).notNull().default('not_started'), // not_started | in_progress | done | blocked
  assigneeId: uuid('assignee_id').references(() => employees.id),
  boqItemId: uuid('boq_item_id').references(() => boqItems.id),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

/** Site asks the store for material; fulfilled by stock issue or escalated to purchase requisition. */
export const siteRequisitions = pgTable('site_requisitions', {
  id: id(),
  no: varchar('no', { length: 30 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  date: date('date').notNull(),
  requiredBy: date('required_by'),
  requestedBy: uuid('requested_by'),
  /** draft | submitted | approved | partially_fulfilled | fulfilled | rejected */
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  remarks: text('remarks'),
  ...timestamps(),
});

export const siteRequisitionLines = pgTable('site_requisition_lines', {
  id: id(),
  requisitionId: uuid('requisition_id').notNull().references(() => siteRequisitions.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  quantity: qty('quantity').notNull(),
  issuedQty: qty('issued_qty').notNull().default('0'),
  boqItemId: uuid('boq_item_id').references(() => boqItems.id),
  remarks: text('remarks'),
});

export const workOrders = pgTable('work_orders', {
  id: id(),
  no: varchar('no', { length: 30 }).notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  partyId: uuid('party_id').notNull().references(() => parties.id), // subcontractor
  date: date('date').notNull(),
  scope: text('scope'),
  value: money('value').notNull().default('0'),
  retentionPercent: rate('retention_percent').notNull().default('0'),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | active | completed | cancelled
  ...timestamps(),
});

export const workOrderLines = pgTable('work_order_lines', {
  id: id(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  boqItemId: uuid('boq_item_id').references(() => boqItems.id),
  description: text('description').notNull(),
  uom: varchar('uom', { length: 20 }),
  quantity: qty('quantity').notNull(),
  rate: money('rate').notNull(),
  amount: money('amount').notNull(),
  executedQty: qty('executed_qty').notNull().default('0'),
});

export const subcontractBills = pgTable('subcontract_bills', {
  id: id(),
  no: varchar('no', { length: 30 }).notNull().unique(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id),
  date: date('date').notNull(),
  periodFrom: date('period_from'),
  periodTo: date('period_to'),
  grossAmount: money('gross_amount').notNull().default('0'),
  retentionAmount: money('retention_amount').notNull().default('0'),
  netAmount: money('net_amount').notNull().default('0'),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | approved | cancelled
  billId: uuid('bill_id').references(() => bills.id),
  ...timestamps(),
});

export const subcontractBillLines = pgTable('subcontract_bill_lines', {
  id: id(),
  subcontractBillId: uuid('subcontract_bill_id').notNull().references(() => subcontractBills.id, { onDelete: 'cascade' }),
  workOrderLineId: uuid('work_order_line_id').notNull().references(() => workOrderLines.id),
  previousQty: qty('previous_qty').notNull(),
  currentQty: qty('current_qty').notNull(),
  rate: money('rate').notNull(),
  amount: money('amount').notNull(),
});

/** Running Account (interim) bill to client. Amounts are for the current bill only. */
export const raBills = pgTable(
  'ra_bills',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    projectId: uuid('project_id').notNull().references(() => projects.id),
    sequence: integer('sequence').notNull(), // RA-1, RA-2, ...
    date: date('date').notNull(),
    periodFrom: date('period_from'),
    periodTo: date('period_to'),
    grossAmount: money('gross_amount').notNull().default('0'),
    retentionAmount: money('retention_amount').notNull().default('0'),
    advanceRecovery: money('advance_recovery').notNull().default('0'),
    vatAmount: money('vat_amount').notNull().default('0'),
    netAmount: money('net_amount').notNull().default('0'),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | submitted | approved | cancelled
    invoiceId: uuid('invoice_id').references(() => invoices.id),
    remarks: text('remarks'),
    ...timestamps(),
  },
  (t) => [unique('ra_seq_uniq').on(t.projectId, t.sequence)],
);

export const raBillLines = pgTable('ra_bill_lines', {
  id: id(),
  raBillId: uuid('ra_bill_id').notNull().references(() => raBills.id, { onDelete: 'cascade' }),
  boqItemId: uuid('boq_item_id').notNull().references(() => boqItems.id),
  previousQty: qty('previous_qty').notNull(),
  currentQty: qty('current_qty').notNull(),
  rate: money('rate').notNull(),
  amount: money('amount').notNull(),
});

export const variationOrders = pgTable('variation_orders', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  no: varchar('no', { length: 30 }).notNull(),
  date: date('date').notNull(),
  description: text('description').notNull(),
  amount: money('amount').notNull(), // signed
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | approved | rejected
  ...timestamps(),
});

export const dailyProgressReports = pgTable(
  'daily_progress_reports',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    weather: varchar('weather', { length: 50 }),
    workDone: text('work_done').notNull(),
    /** [{ trade: 'Mason', count: 12 }, ...] */
    manpower: jsonb('manpower').$type<{ trade: string; count: number }[]>().notNull().default([]),
    issues: text('issues'),
    nextDayPlan: text('next_day_plan'),
    preparedBy: uuid('prepared_by'),
    ...timestamps(),
  },
  (t) => [unique('dpr_uniq').on(t.projectId, t.date)],
);

export const equipment = pgTable('equipment', {
  id: id(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 50 }), // mixer, excavator, crane, vibrator
  ownership: varchar('ownership', { length: 10 }).notNull().default('owned'), // owned | rented
  hourlyRate: money('hourly_rate').notNull().default('0'), // internal charge-out or rental rate
  currentProjectId: uuid('current_project_id').references(() => projects.id),
  status: varchar('status', { length: 20 }).notNull().default('available'), // available | in_use | maintenance | retired
  ...timestamps(),
});

export const equipmentLogs = pgTable('equipment_logs', {
  id: id(),
  equipmentId: uuid('equipment_id').notNull().references(() => equipment.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  date: date('date').notNull(),
  hours: qty('hours').notNull(),
  fuelLiters: qty('fuel_liters').notNull().default('0'),
  operatorId: uuid('operator_id').references(() => employees.id),
  cost: money('cost').notNull().default('0'),
  remarks: text('remarks'),
  ...timestamps(),
});
