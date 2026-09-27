import { pgTable, varchar, text, uuid, date, boolean, index, unique } from 'drizzle-orm/pg-core';
import { id, timestamps, money, rate } from './_common';
import { journalEntries } from './finance';
import { projects } from './construction';

export const investors = pgTable(
  'investors',
  {
    id: id(),
    code: varchar('code', { length: 30 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    type: varchar('type', { length: 20 }).notNull().default('individual'), // individual | company
    contactPerson: varchar('contact_person', { length: 200 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 200 }),
    address: text('address'),
    nid: varchar('nid', { length: 30 }),
    tin: varchar('tin', { length: 30 }),
    passportNo: varchar('passport_no', { length: 30 }),
    bankName: varchar('bank_name', { length: 100 }),
    bankAccountNo: varchar('bank_account_no', { length: 50 }),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active | exited
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [index('investors_status_idx').on(t.status)],
);

/**
 * One agreement = one investor's stake in one project: the amount committed and the share of that
 * project's profit they are entitled to. Profit entitlement is computed from the project's live
 * profit; what has actually been booked and paid is recorded as transactions.
 */
export const investmentAgreements = pgTable(
  'investment_agreements',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    investorId: uuid('investor_id').notNull().references(() => investors.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id),
    date: date('date').notNull(),
    committedAmount: money('committed_amount').notNull(),
    profitSharePercent: rate('profit_share_percent').notNull(),
    /** Whether the investor also carries that share of a loss. */
    sharesLoss: boolean('shares_loss').notNull().default(true),
    startDate: date('start_date'),
    endDate: date('end_date'),
    terms: text('terms'),
    status: varchar('status', { length: 20 }).notNull().default('active'), // draft | active | closed | cancelled
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('agreement_investor_idx').on(t.investorId), index('agreement_project_idx').on(t.projectId)],
);

/**
 * Money and profit movements for an investor. Every row posts to the ledger:
 *  contribution  Dr bank/cash              Cr investor capital
 *  payout        Dr investor capital       Cr bank/cash
 *  profit_share  Dr investor profit share  Cr investor payable
 *  loss_share    Dr investor payable       Cr investor profit share
 */
export const investorTransactions = pgTable(
  'investor_transactions',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    investorId: uuid('investor_id').notNull().references(() => investors.id),
    agreementId: uuid('agreement_id').references(() => investmentAgreements.id),
    projectId: uuid('project_id').references(() => projects.id),
    date: date('date').notNull(),
    type: varchar('type', { length: 20 }).notNull(), // contribution | payout | profit_share | loss_share
    amount: money('amount').notNull(),
    cashAccountId: uuid('cash_account_id'),
    method: varchar('method', { length: 20 }), // cash | cheque | bank_transfer | mobile_banking
    reference: varchar('reference', { length: 100 }),
    /** For profit_share rows: the period the share was computed for. */
    periodFrom: date('period_from'),
    periodTo: date('period_to'),
    notes: text('notes'),
    status: varchar('status', { length: 20 }).notNull().default('posted'), // posted | cancelled
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('inv_txn_investor_idx').on(t.investorId), index('inv_txn_project_idx').on(t.projectId), index('inv_txn_type_idx').on(t.type)],
);

/** Client-facing estimate. Winning one creates the project and its BOQ. */
export const quotations = pgTable(
  'quotations',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    date: date('date').notNull(),
    validUntil: date('valid_until'),
    clientId: uuid('client_id'),
    title: varchar('title', { length: 200 }).notNull(),
    location: text('location'),
    /** Project code to use when this quotation is won. */
    projectCode: varchar('project_code', { length: 30 }),
    subtotal: money('subtotal').notNull().default('0'),
    discount: money('discount').notNull().default('0'),
    vatPercent: rate('vat_percent').notNull().default('0'),
    vatAmount: money('vat_amount').notNull().default('0'),
    total: money('total').notNull().default('0'),
    retentionPercent: rate('retention_percent').notNull().default('0'),
    /** draft | sent | won | lost | expired | cancelled */
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    lostReason: text('lost_reason'),
    notes: text('notes'),
    terms: text('terms'),
    wonProjectId: uuid('won_project_id').references(() => projects.id),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('quotation_client_idx').on(t.clientId), index('quotation_status_idx').on(t.status)],
);

export const quotationLines = pgTable('quotation_lines', {
  id: id(),
  quotationId: uuid('quotation_id').notNull().references(() => quotations.id, { onDelete: 'cascade' }),
  lineNo: varchar('line_no', { length: 30 }).notNull(),
  description: text('description').notNull(),
  uom: varchar('uom', { length: 20 }),
  quantity: money('quantity').notNull().default('0'),
  rate: money('rate').notNull().default('0'),
  amount: money('amount').notNull().default('0'),
  isSection: boolean('is_section').notNull().default(false),
  sortOrder: varchar('sort_order', { length: 10 }).notNull().default('0'),
});

/** Company paperwork with expiry tracking; scans attach to each row. */
export const companyDocuments = pgTable(
  'company_documents',
  {
    id: id(),
    category: varchar('category', { length: 50 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    docNo: varchar('doc_no', { length: 100 }),
    issuedBy: varchar('issued_by', { length: 200 }),
    issueDate: date('issue_date'),
    expiryDate: date('expiry_date'),
    projectId: uuid('project_id').references(() => projects.id),
    isConfidential: boolean('is_confidential').notNull().default(false),
    remarks: text('remarks'),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('company_doc_category_idx').on(t.category), index('company_doc_expiry_idx').on(t.expiryDate)],
);

/** A reconciliation closed against a bank statement on a given date. */
export const bankReconciliations = pgTable(
  'bank_reconciliations',
  {
    id: id(),
    bankAccountId: uuid('bank_account_id').notNull(),
    statementDate: date('statement_date').notNull(),
    statementBalance: money('statement_balance').notNull(),
    bookBalance: money('book_balance').notNull(),
    difference: money('difference').notNull(),
    notes: text('notes'),
    closedBy: uuid('closed_by'),
    ...timestamps(),
  },
  (t) => [unique('bank_recon_uniq').on(t.bankAccountId, t.statementDate)],
);
