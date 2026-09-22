import { pgTable, varchar, text, boolean, uuid, date, integer, index, unique, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, timestamps, money, qty, rate } from './_common';

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(), // asset | liability | equity | income | expense
    /** bank | cash | receivable | payable | tax | inventory | fixed_asset | wip | retention | null */
    subtype: varchar('subtype', { length: 30 }),
    parentId: uuid('parent_id'),
    isGroup: boolean('is_group').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
    ...timestamps(),
  },
  (t) => [index('accounts_parent_idx').on(t.parentId)],
);

/** Logical account roles used by the posting engine → concrete account per tenant. */
export const accountMappings = pgTable('account_mappings', {
  key: varchar('key', { length: 50 }).primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
});

export const fiscalYears = pgTable('fiscal_years', {
  id: id(),
  name: varchar('name', { length: 20 }).notNull().unique(), // FY2026-27
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isClosed: boolean('is_closed').notNull().default(false),
  ...timestamps(),
});

export const fiscalPeriods = pgTable(
  'fiscal_periods',
  {
    id: id(),
    fiscalYearId: uuid('fiscal_year_id').notNull().references(() => fiscalYears.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 20 }).notNull(), // 2026-07
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isLocked: boolean('is_locked').notNull().default(false),
  },
  (t) => [unique('period_uniq').on(t.fiscalYearId, t.name)],
);

export const taxCodes = pgTable('tax_codes', {
  id: id(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  kind: varchar('kind', { length: 10 }).notNull(), // vat | tds | vds
  rate: rate('rate').notNull(), // percent, e.g. 15.000000
  section: varchar('section', { length: 50 }), // ITA 2023 section / VAT service code
  accountId: uuid('account_id').references(() => accounts.id),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
});

export const parties = pgTable(
  'parties',
  {
    id: id(),
    code: varchar('code', { length: 30 }).notNull().unique(),
    type: varchar('type', { length: 20 }).notNull(), // customer | vendor | subcontractor
    name: varchar('name', { length: 200 }).notNull(),
    contactPerson: varchar('contact_person', { length: 200 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 200 }),
    address: text('address'),
    binNo: varchar('bin_no', { length: 30 }),
    tin: varchar('tin', { length: 30 }),
    tradeLicense: varchar('trade_license', { length: 50 }),
    creditLimit: money('credit_limit'),
    paymentTermsDays: integer('payment_terms_days').notNull().default(30),
    defaultTdsCodeId: uuid('default_tds_code_id').references(() => taxCodes.id),
    defaultVdsCodeId: uuid('default_vds_code_id').references(() => taxCodes.id),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('parties_type_idx').on(t.type)],
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    date: date('date').notNull(),
    reference: varchar('reference', { length: 100 }),
    narration: text('narration'),
    /** manual | invoice | bill | payment | grn | issue | payroll | ra_bill | sub_bill | adjustment */
    sourceType: varchar('source_type', { length: 30 }).notNull().default('manual'),
    sourceId: uuid('source_id'),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | posted | reversed
    totalDebit: money('total_debit').notNull().default('0'),
    totalCredit: money('total_credit').notNull().default('0'),
    reversalOfId: uuid('reversal_of_id'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: uuid('posted_by'),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [
    index('je_date_idx').on(t.date),
    index('je_source_idx').on(t.sourceType, t.sourceId),
    check('je_balanced', sql`${t.status} <> 'posted' OR ${t.totalDebit} = ${t.totalCredit}`),
  ],
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: id(),
    entryId: uuid('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    debit: money('debit').notNull().default('0'),
    credit: money('credit').notNull().default('0'),
    partyId: uuid('party_id').references(() => parties.id),
    projectId: uuid('project_id'), // cost center
    departmentId: uuid('department_id'),
    description: text('description'),
    currency: varchar('currency', { length: 3 }).notNull().default('BDT'),
    fxRate: rate('fx_rate').notNull().default('1'),
  },
  (t) => [
    index('jl_account_idx').on(t.accountId),
    index('jl_project_idx').on(t.projectId),
    index('jl_party_idx').on(t.partyId),
    check('jl_one_side', sql`(${t.debit} = 0) <> (${t.credit} = 0)`),
    check('jl_non_negative', sql`${t.debit} >= 0 AND ${t.credit} >= 0`),
  ],
);

/** AR invoice (sales / client bills). */
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    partyId: uuid('party_id').notNull().references(() => parties.id),
    date: date('date').notNull(),
    dueDate: date('due_date'),
    projectId: uuid('project_id'),
    raBillId: uuid('ra_bill_id'),
    mushakNo: varchar('mushak_no', { length: 50 }), // Mushak-6.3 serial
    currency: varchar('currency', { length: 3 }).notNull().default('BDT'),
    fxRate: rate('fx_rate').notNull().default('1'),
    subtotal: money('subtotal').notNull().default('0'),
    vatAmount: money('vat_amount').notNull().default('0'),
    retentionAmount: money('retention_amount').notNull().default('0'),
    advanceAdjustment: money('advance_adjustment').notNull().default('0'),
    total: money('total').notNull().default('0'), // receivable = subtotal + vat - retention - advance
    paidAmount: money('paid_amount').notNull().default('0'),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | posted | partially_paid | paid | cancelled
    notes: text('notes'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('inv_party_idx').on(t.partyId), index('inv_project_idx').on(t.projectId)],
);

export const invoiceLines = pgTable('invoice_lines', {
  id: id(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  description: text('description').notNull(),
  itemId: uuid('item_id'),
  quantity: qty('quantity').notNull().default('1'),
  unitPrice: money('unit_price').notNull(),
  amount: money('amount').notNull(),
  vatCodeId: uuid('vat_code_id').references(() => taxCodes.id),
  vatAmount: money('vat_amount').notNull().default('0'),
  incomeAccountId: uuid('income_account_id').references(() => accounts.id),
});

/** AP bill (vendor / subcontractor bills). */
export const bills = pgTable(
  'bills',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    partyId: uuid('party_id').notNull().references(() => parties.id),
    vendorRef: varchar('vendor_ref', { length: 100 }),
    date: date('date').notNull(),
    dueDate: date('due_date'),
    projectId: uuid('project_id'),
    purchaseOrderId: uuid('purchase_order_id'),
    goodsReceiptId: uuid('goods_receipt_id'),
    subcontractBillId: uuid('subcontract_bill_id'),
    currency: varchar('currency', { length: 3 }).notNull().default('BDT'),
    fxRate: rate('fx_rate').notNull().default('1'),
    subtotal: money('subtotal').notNull().default('0'),
    vatAmount: money('vat_amount').notNull().default('0'),
    retentionAmount: money('retention_amount').notNull().default('0'),
    total: money('total').notNull().default('0'), // payable = subtotal + vat - retention
    paidAmount: money('paid_amount').notNull().default('0'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    notes: text('notes'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('bill_party_idx').on(t.partyId), index('bill_project_idx').on(t.projectId)],
);

export const billLines = pgTable('bill_lines', {
  id: id(),
  billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  description: text('description').notNull(),
  itemId: uuid('item_id'),
  quantity: qty('quantity').notNull().default('1'),
  unitPrice: money('unit_price').notNull(),
  amount: money('amount').notNull(),
  vatCodeId: uuid('vat_code_id').references(() => taxCodes.id),
  vatAmount: money('vat_amount').notNull().default('0'),
  /** Expense / asset account; null when cleared against GRNI (goods receipt linked). */
  expenseAccountId: uuid('expense_account_id').references(() => accounts.id),
});

export const bankAccounts = pgTable('bank_accounts', {
  id: id(),
  accountId: uuid('account_id').notNull().unique().references(() => accounts.id),
  bankName: varchar('bank_name', { length: 100 }).notNull(),
  branchName: varchar('branch_name', { length: 100 }),
  accountNo: varchar('account_no', { length: 50 }).notNull(),
  routingNo: varchar('routing_no', { length: 20 }),
  currency: varchar('currency', { length: 3 }).notNull().default('BDT'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
});

/** Receipt (from customer) or payment (to vendor), with withholding at source. */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    direction: varchar('direction', { length: 10 }).notNull(), // in | out
    partyId: uuid('party_id').notNull().references(() => parties.id),
    date: date('date').notNull(),
    /** GL cash/bank account the money moves through. */
    cashAccountId: uuid('cash_account_id').notNull().references(() => accounts.id),
    method: varchar('method', { length: 20 }).notNull(), // cash | cheque | bank_transfer | mobile_banking
    chequeNo: varchar('cheque_no', { length: 50 }),
    reference: varchar('reference', { length: 100 }),
    /** Gross amount settled against documents. net cash = amount - tds - vds */
    amount: money('amount').notNull(),
    tdsCodeId: uuid('tds_code_id').references(() => taxCodes.id),
    tdsAmount: money('tds_amount').notNull().default('0'),
    vdsCodeId: uuid('vds_code_id').references(() => taxCodes.id),
    vdsAmount: money('vds_amount').notNull().default('0'),
    projectId: uuid('project_id'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    notes: text('notes'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('pay_party_idx').on(t.partyId)],
);

export const paymentAllocations = pgTable('payment_allocations', {
  id: id(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  billId: uuid('bill_id').references(() => bills.id),
  amount: money('amount').notNull(),
});

export const bankStatementLines = pgTable('bank_statement_lines', {
  id: id(),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  description: text('description'),
  reference: varchar('reference', { length: 100 }),
  amount: money('amount').notNull(), // +deposit / -withdrawal
  matchedJournalLineId: uuid('matched_journal_line_id').references(() => journalLines.id),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  ...timestamps(),
});
