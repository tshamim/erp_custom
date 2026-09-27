import { pgTable, varchar, text, uuid, date, integer, boolean, index } from 'drizzle-orm/pg-core';
import { id, timestamps, money } from './_common';
import { journalEntries } from './finance';

/**
 * EB-3 visa processing for a recruitment agency: US employers raise job orders, candidates are
 * matched to them, and each match becomes a case tracked through the statutory stages.
 * This is case administration — it records dates, documents and fees; it gives no legal advice.
 */

export const eb3Employers = pgTable('eb3_employers', {
  id: id(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  contactPerson: varchar('contact_person', { length: 200 }),
  email: varchar('email', { length: 200 }),
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  industry: varchar('industry', { length: 100 }),
  fein: varchar('fein', { length: 30 }),
  attorneyName: varchar('attorney_name', { length: 200 }),
  attorneyEmail: varchar('attorney_email', { length: 200 }),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active | inactive
  notes: text('notes'),
  ...timestamps(),
});

export const eb3JobOrders = pgTable(
  'eb3_job_orders',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    employerId: uuid('employer_id').notNull().references(() => eb3Employers.id),
    title: varchar('title', { length: 200 }).notNull(),
    socCode: varchar('soc_code', { length: 20 }),
    positions: integer('positions').notNull().default(1),
    filledPositions: integer('filled_positions').notNull().default(0),
    offeredWage: money('offered_wage'),
    wageUnit: varchar('wage_unit', { length: 20 }).default('hour'), // hour | week | month | year
    worksiteCity: varchar('worksite_city', { length: 100 }),
    worksiteState: varchar('worksite_state', { length: 50 }),
    requirements: text('requirements'),
    openedDate: date('opened_date'),
    status: varchar('status', { length: 20 }).notNull().default('open'), // open | filled | on_hold | closed
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [index('eb3_job_employer_idx').on(t.employerId), index('eb3_job_status_idx').on(t.status)],
);

export const eb3Candidates = pgTable(
  'eb3_candidates',
  {
    id: id(),
    code: varchar('code', { length: 30 }).notNull().unique(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    fatherName: varchar('father_name', { length: 200 }),
    dateOfBirth: date('date_of_birth'),
    gender: varchar('gender', { length: 10 }),
    maritalStatus: varchar('marital_status', { length: 20 }),
    dependents: integer('dependents').notNull().default(0),
    nid: varchar('nid', { length: 30 }),
    passportNo: varchar('passport_no', { length: 30 }),
    passportIssueDate: date('passport_issue_date'),
    passportExpiry: date('passport_expiry'),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 200 }),
    address: text('address'),
    district: varchar('district', { length: 100 }),
    education: varchar('education', { length: 200 }),
    experienceYears: integer('experience_years'),
    skill: varchar('skill', { length: 100 }),
    englishLevel: varchar('english_level', { length: 20 }), // none | basic | conversational | fluent
    /** lead | screening | selected | case_open | visa_issued | departed | rejected | withdrawn */
    status: varchar('status', { length: 20 }).notNull().default('lead'),
    source: varchar('source', { length: 100 }),
    assignedTo: uuid('assigned_to'),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [index('eb3_cand_status_idx').on(t.status), index('eb3_cand_passport_idx').on(t.passportNo)],
);

/** Statutory stages, in order. `stage` always holds the furthest stage reached. */
export const EB3_STAGES = [
  'prevailing_wage',
  'recruitment',
  'perm_filed',
  'perm_approved',
  'i140_filed',
  'i140_approved',
  'nvc_processing',
  'ds260_submitted',
  'interview_scheduled',
  'visa_approved',
  'visa_denied',
  'departed',
] as const;

export const eb3Cases = pgTable(
  'eb3_cases',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    candidateId: uuid('candidate_id').notNull().references(() => eb3Candidates.id),
    employerId: uuid('employer_id').notNull().references(() => eb3Employers.id),
    jobOrderId: uuid('job_order_id').references(() => eb3JobOrders.id),
    stage: varchar('stage', { length: 30 }).notNull().default('prevailing_wage'),
    stageDate: date('stage_date'),
    openedDate: date('opened_date').notNull(),
    priorityDate: date('priority_date'),
    permCaseNo: varchar('perm_case_no', { length: 50 }),
    i140Receipt: varchar('i140_receipt', { length: 50 }),
    nvcCaseNo: varchar('nvc_case_no', { length: 50 }),
    interviewDate: date('interview_date'),
    consulate: varchar('consulate', { length: 100 }),
    visaNumber: varchar('visa_number', { length: 50 }),
    departureDate: date('departure_date'),
    attorneyName: varchar('attorney_name', { length: 200 }),
    /** active | on_hold | closed | withdrawn | denied */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    agreedFee: money('agreed_fee').notNull().default('0'),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('eb3_case_candidate_idx').on(t.candidateId), index('eb3_case_stage_idx').on(t.stage), index('eb3_case_status_idx').on(t.status)],
);

/** Every stage change and note, in order — the case history a client asks about. */
export const eb3CaseEvents = pgTable(
  'eb3_case_events',
  {
    id: id(),
    caseId: uuid('case_id').notNull().references(() => eb3Cases.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    stage: varchar('stage', { length: 30 }),
    title: varchar('title', { length: 200 }).notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('eb3_event_case_idx').on(t.caseId)],
);

/** Document checklist per case; scans attach to the case. */
export const eb3CaseDocuments = pgTable(
  'eb3_case_documents',
  {
    id: id(),
    caseId: uuid('case_id').notNull().references(() => eb3Cases.id, { onDelete: 'cascade' }),
    docType: varchar('doc_type', { length: 100 }).notNull(),
    required: boolean('required').notNull().default(true),
    receivedDate: date('received_date'),
    expiryDate: date('expiry_date'),
    remarks: text('remarks'),
    ...timestamps(),
  },
  (t) => [index('eb3_doc_case_idx').on(t.caseId)],
);

/** Fees in and out on a case. Receipts post to the ledger as service income. */
export const eb3Payments = pgTable(
  'eb3_payments',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    caseId: uuid('case_id').references(() => eb3Cases.id),
    candidateId: uuid('candidate_id').notNull().references(() => eb3Candidates.id),
    date: date('date').notNull(),
    /** service_fee | government_fee | attorney_fee | medical | travel | refund */
    type: varchar('type', { length: 30 }).notNull(),
    direction: varchar('direction', { length: 10 }).notNull().default('in'), // in = from candidate, out = paid on their behalf
    amount: money('amount').notNull(),
    cashAccountId: uuid('cash_account_id'),
    method: varchar('method', { length: 20 }),
    reference: varchar('reference', { length: 100 }),
    notes: text('notes'),
    status: varchar('status', { length: 20 }).notNull().default('posted'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('eb3_pay_case_idx').on(t.caseId), index('eb3_pay_candidate_idx').on(t.candidateId)],
);
