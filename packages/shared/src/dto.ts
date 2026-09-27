import { z } from 'zod';

// ---------- primitives ----------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
/** Decimal as string or number → normalized string (keeps precision out of JS floats in transit). */
const decimal = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), 'Invalid number');
const positiveDecimal = decimal.refine((v) => Number(v) > 0, 'Must be greater than 0');
const nonNegDecimal = decimal.refine((v) => Number(v) >= 0, 'Must be 0 or more');
const uuid = z.string().uuid();
const optUuid = uuid.nullish();
const optStr = z.string().trim().max(2000).nullish();

export const zx = { isoDate, decimal, positiveDecimal, nonNegDecimal, uuid };

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().optional(),
  sort: z.string().optional(), // "field" or "-field"
  status: z.string().optional(),
  projectId: z.string().uuid().optional(),
  partyId: z.string().uuid().optional(),
  type: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- auth / platform ----------
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const createTenantSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,39}$/, 'lowercase letters, digits, underscore; 3-40 chars; starts with a letter'),
  name: z.string().min(2).max(200),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  plan: z.string().default('standard'),
  /** Modules to enable; omitted = all modules. */
  modules: z.array(z.string()).optional(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});
export type CreateTenantDto = z.infer<typeof createTenantSchema>;

export const tenantModulesSchema = z.object({ modules: z.record(z.boolean()) });
export const subscriptionSchema = z.object({
  plan: z.string().min(1).max(50),
  maxUsers: z.coerce.number().int().min(1).max(100000),
  endsAt: isoDate.nullish(),
});
export const impersonateSchema = z.object({ userId: uuid.optional(), reason: z.string().min(3).max(500) });

// ---------- vendor management ----------
export const vendorEvaluationSchema = z.object({
  partyId: uuid,
  date: isoDate,
  quality: z.coerce.number().int().min(1).max(5),
  delivery: z.coerce.number().int().min(1).max(5),
  price: z.coerce.number().int().min(1).max(5),
  service: z.coerce.number().int().min(1).max(5),
  remarks: optStr,
});
export const vendorDocumentSchema = z.object({
  partyId: uuid,
  docType: z.string().min(2).max(50),
  docNo: optStr,
  issueDate: isoDate.nullish(),
  expiryDate: isoDate.nullish(),
  remarks: optStr,
});
export const vendorStatusSchema = z.object({
  status: z.enum(['approved', 'pending', 'on_hold', 'blacklisted']),
  reason: optStr,
});

// ---------- investors ----------
export const investorSchema = z.object({
  code: z.string().max(30).optional(),
  name: z.string().min(2).max(200),
  type: z.enum(['individual', 'company']).default('individual'),
  contactPerson: optStr,
  phone: optStr,
  email: z.string().email().nullish().or(z.literal('')),
  address: optStr,
  nid: optStr,
  tin: optStr,
  passportNo: optStr,
  bankName: optStr,
  bankAccountNo: optStr,
  status: z.enum(['active', 'exited']).default('active'),
  notes: optStr,
});
export type InvestorDto = z.infer<typeof investorSchema>;

export const investmentAgreementSchema = z.object({
  investorId: uuid,
  projectId: uuid,
  date: isoDate,
  committedAmount: positiveDecimal,
  profitSharePercent: nonNegDecimal.refine((v) => Number(v) <= 100, 'Share cannot exceed 100%'),
  sharesLoss: z.boolean().default(true),
  startDate: isoDate.nullish(),
  endDate: isoDate.nullish(),
  terms: optStr,
  status: z.enum(['draft', 'active', 'closed', 'cancelled']).default('active'),
});
export type InvestmentAgreementDto = z.infer<typeof investmentAgreementSchema>;

/** Money in from, or out to, an investor. Profit shares are booked through their own endpoint. */
export const investorTransactionSchema = z.object({
  investorId: uuid,
  agreementId: optUuid,
  projectId: optUuid,
  date: isoDate,
  type: z.enum(['contribution', 'payout']),
  amount: positiveDecimal,
  cashAccountId: uuid,
  method: z.enum(['cash', 'cheque', 'bank_transfer', 'mobile_banking']).default('bank_transfer'),
  reference: optStr,
  notes: optStr,
});
export type InvestorTransactionDto = z.infer<typeof investorTransactionSchema>;

/** Books an investor's share of a project's profit (or loss) for a period. */
export const profitAllocationSchema = z.object({
  agreementId: uuid,
  date: isoDate,
  periodFrom: isoDate,
  periodTo: isoDate,
  /** Leave blank to use the share computed from the project's profit for that period. */
  amount: decimal.nullish(),
  notes: optStr,
});
export type ProfitAllocationDto = z.infer<typeof profitAllocationSchema>;

// ---------- quotations ----------
export const quotationSchema = z.object({
  date: isoDate,
  validUntil: isoDate.nullish(),
  clientId: optUuid,
  title: z.string().min(2).max(200),
  location: optStr,
  projectCode: optStr,
  discount: nonNegDecimal.default('0'),
  vatPercent: nonNegDecimal.default('0'),
  retentionPercent: nonNegDecimal.default('0'),
  notes: optStr,
  terms: optStr,
  lines: z
    .array(
      z.object({
        lineNo: z.string().min(1).max(30),
        description: z.string().min(1),
        uom: optStr,
        quantity: nonNegDecimal.default('0'),
        rate: nonNegDecimal.default('0'),
        isSection: z.boolean().default(false),
      }),
    )
    .min(1),
});
export type QuotationDto = z.infer<typeof quotationSchema>;

/** Turns a won quotation into a live project with its BOQ. */
export const quotationWinSchema = z.object({
  projectCode: z.string().min(1).max(30),
  startDate: isoDate.nullish(),
  endDate: isoDate.nullish(),
  mobilizationAdvance: nonNegDecimal.default('0'),
  advanceRecoveryPercent: nonNegDecimal.default('0'),
  projectManagerId: optUuid,
  createSiteStore: z.boolean().default(true),
});
export type QuotationWinDto = z.infer<typeof quotationWinSchema>;

// ---------- company documents ----------
export const DOCUMENT_CATEGORIES = [
  'trade_licence',
  'incorporation',
  'tin_bin',
  'tax_return',
  'insurance',
  'bank',
  'licence_enlistment',
  'contract',
  'certificate',
  'site_photo',
  'other',
] as const;

export const companyDocumentSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().min(2).max(200),
  docNo: optStr,
  issuedBy: optStr,
  issueDate: isoDate.nullish(),
  expiryDate: isoDate.nullish(),
  projectId: optUuid,
  isConfidential: z.boolean().default(false),
  remarks: optStr,
});
export type CompanyDocumentDto = z.infer<typeof companyDocumentSchema>;

// ---------- bank ----------
export const bankReconcileCloseSchema = z.object({
  statementDate: isoDate,
  statementBalance: decimal,
  notes: optStr,
});

// ---------- EB-3 visa processing ----------
export const eb3EmployerSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(2).max(200),
  contactPerson: optStr,
  email: z.string().email().nullish().or(z.literal('')),
  phone: optStr,
  address: optStr,
  city: optStr,
  state: optStr,
  industry: optStr,
  fein: optStr,
  attorneyName: optStr,
  attorneyEmail: z.string().email().nullish().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
  notes: optStr,
});
export type Eb3EmployerDto = z.infer<typeof eb3EmployerSchema>;

export const eb3JobOrderSchema = z.object({
  employerId: uuid,
  title: z.string().min(2).max(200),
  socCode: optStr,
  positions: z.coerce.number().int().min(1).default(1),
  offeredWage: nonNegDecimal.nullish(),
  wageUnit: z.enum(['hour', 'week', 'month', 'year']).default('hour'),
  worksiteCity: optStr,
  worksiteState: optStr,
  requirements: optStr,
  openedDate: isoDate.nullish(),
  status: z.enum(['open', 'filled', 'on_hold', 'closed']).default('open'),
  notes: optStr,
});
export type Eb3JobOrderDto = z.infer<typeof eb3JobOrderSchema>;

export const eb3CandidateSchema = z.object({
  code: z.string().max(30).optional(),
  fullName: z.string().min(2).max(200),
  fatherName: optStr,
  dateOfBirth: isoDate.nullish(),
  gender: z.enum(['male', 'female', 'other']).nullish(),
  maritalStatus: optStr,
  dependents: z.coerce.number().int().min(0).default(0),
  nid: optStr,
  passportNo: optStr,
  passportIssueDate: isoDate.nullish(),
  passportExpiry: isoDate.nullish(),
  phone: optStr,
  email: z.string().email().nullish().or(z.literal('')),
  address: optStr,
  district: optStr,
  education: optStr,
  experienceYears: z.coerce.number().int().min(0).nullish(),
  skill: optStr,
  englishLevel: z.enum(['none', 'basic', 'conversational', 'fluent']).nullish(),
  status: z.enum(['lead', 'screening', 'selected', 'case_open', 'visa_issued', 'departed', 'rejected', 'withdrawn']).default('lead'),
  source: optStr,
  assignedTo: optUuid,
  notes: optStr,
});
export type Eb3CandidateDto = z.infer<typeof eb3CandidateSchema>;

export const EB3_STAGE_LIST = [
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
export type Eb3Stage = (typeof EB3_STAGE_LIST)[number];

export const eb3CaseSchema = z.object({
  candidateId: uuid,
  employerId: uuid,
  jobOrderId: optUuid,
  openedDate: isoDate,
  priorityDate: isoDate.nullish(),
  attorneyName: optStr,
  agreedFee: nonNegDecimal.default('0'),
  notes: optStr,
});
export type Eb3CaseDto = z.infer<typeof eb3CaseSchema>;

export const eb3StageSchema = z.object({
  stage: z.enum(EB3_STAGE_LIST),
  date: isoDate,
  notes: optStr,
  permCaseNo: optStr,
  i140Receipt: optStr,
  nvcCaseNo: optStr,
  interviewDate: isoDate.nullish(),
  consulate: optStr,
  visaNumber: optStr,
  departureDate: isoDate.nullish(),
});
export type Eb3StageDto = z.infer<typeof eb3StageSchema>;

export const eb3CaseDocumentSchema = z.object({
  caseId: uuid,
  docType: z.string().min(2).max(100),
  required: z.boolean().default(true),
  receivedDate: isoDate.nullish(),
  expiryDate: isoDate.nullish(),
  remarks: optStr,
});
export type Eb3CaseDocumentDto = z.infer<typeof eb3CaseDocumentSchema>;

export const eb3PaymentSchema = z.object({
  caseId: optUuid,
  candidateId: uuid,
  date: isoDate,
  type: z.enum(['service_fee', 'government_fee', 'attorney_fee', 'medical', 'travel', 'refund']),
  direction: z.enum(['in', 'out']).default('in'),
  amount: positiveDecimal,
  cashAccountId: uuid,
  method: z.enum(['cash', 'cheque', 'bank_transfer', 'mobile_banking']).default('cash'),
  reference: optStr,
  notes: optStr,
});
export type Eb3PaymentDto = z.infer<typeof eb3PaymentSchema>;

// ---------- core ----------
export const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(200),
  phone: optStr,
  password: z.string().min(8).optional(),
  isActive: z.boolean().default(true),
  branchId: optUuid,
  employeeId: optUuid,
  roleIds: z.array(uuid).default([]),
});
export type UserDto = z.infer<typeof userSchema>;

export const roleSchema = z.object({
  name: z.string().min(2).max(100),
  description: optStr,
  permissions: z.array(z.string()).default([]),
});
export type RoleDto = z.infer<typeof roleSchema>;

export const branchSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(200),
  address: optStr,
  phone: optStr,
  binNo: optStr,
  isActive: z.boolean().default(true),
});

// ---------- HR ----------
export const departmentSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(200),
  parentId: optUuid,
  isActive: z.boolean().default(true),
});
export const designationSchema = z.object({ name: z.string().min(2).max(200), grade: optStr });

export const employeeSchema = z.object({
  code: z.string().min(1).max(30).optional(), // auto-generated when omitted
  firstName: z.string().min(1).max(100),
  lastName: optStr,
  fatherName: optStr,
  motherName: optStr,
  gender: z.enum(['male', 'female', 'other']).nullish(),
  dateOfBirth: isoDate.nullish(),
  nid: optStr,
  tin: optStr,
  phone: optStr,
  email: z.string().email().nullish().or(z.literal('')),
  presentAddress: optStr,
  permanentAddress: optStr,
  emergencyContactName: optStr,
  emergencyContactPhone: optStr,
  bloodGroup: optStr,
  departmentId: optUuid,
  designationId: optUuid,
  branchId: optUuid,
  managerId: optUuid,
  employmentType: z.enum(['permanent', 'contract', 'probation', 'daily_wage']).default('permanent'),
  joiningDate: isoDate,
  confirmationDate: isoDate.nullish(),
  exitDate: isoDate.nullish(),
  status: z.enum(['active', 'resigned', 'terminated']).default('active'),
  bankName: optStr,
  bankAccountNo: optStr,
  mobileBankingNo: optStr,
  dailyWage: nonNegDecimal.nullish(),
  currentProjectId: optUuid,
});
export type EmployeeDto = z.infer<typeof employeeSchema>;

export const attendanceBulkSchema = z.object({
  date: isoDate,
  projectId: optUuid,
  records: z
    .array(
      z.object({
        employeeId: uuid,
        status: z.enum(['present', 'absent', 'late', 'half_day', 'leave', 'holiday']),
        checkIn: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
        checkOut: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
        overtimeHours: nonNegDecimal.default('0'),
        remarks: optStr,
      }),
    )
    .min(1),
});
export type AttendanceBulkDto = z.infer<typeof attendanceBulkSchema>;

export const leaveRequestSchema = z
  .object({
    employeeId: uuid,
    leaveTypeId: uuid,
    fromDate: isoDate,
    toDate: isoDate,
    reason: optStr,
  })
  .refine((v) => v.toDate >= v.fromDate, { message: 'toDate must be on/after fromDate', path: ['toDate'] });
export type LeaveRequestDto = z.infer<typeof leaveRequestSchema>;

export const leaveDecisionSchema = z.object({ status: z.enum(['approved', 'rejected']), remarks: optStr });

// ---------- payroll ----------
export const salaryStructureSchema = z.object({
  employeeId: uuid,
  effectiveFrom: isoDate,
  basic: positiveDecimal,
  houseRent: nonNegDecimal.default('0'),
  medical: nonNegDecimal.default('0'),
  conveyance: nonNegDecimal.default('0'),
  otherAllowance: nonNegDecimal.default('0'),
  pfPercent: nonNegDecimal.default('0'),
  overtimeRatePerHour: nonNegDecimal.default('0'),
  taxEnabled: z.boolean().default(true),
});
export type SalaryStructureDto = z.infer<typeof salaryStructureSchema>;

export const payrollRunSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  workingDays: z.coerce.number().int().min(1).max(31).optional(),
  includeFestivalBonus: z.boolean().default(false),
});
export type PayrollRunDto = z.infer<typeof payrollRunSchema>;

// ---------- finance ----------
export const accountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(200),
  type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  subtype: optStr,
  parentId: optUuid,
  isGroup: z.boolean().default(false),
  isActive: z.boolean().default(true),
  description: optStr,
});
export type AccountDto = z.infer<typeof accountSchema>;

export const journalLineSchema = z.object({
  accountId: uuid,
  debit: nonNegDecimal.default('0'),
  credit: nonNegDecimal.default('0'),
  partyId: optUuid,
  projectId: optUuid,
  departmentId: optUuid,
  description: optStr,
});
export const journalEntrySchema = z.object({
  date: isoDate,
  reference: optStr,
  narration: optStr,
  lines: z.array(journalLineSchema).min(2),
});
export type JournalEntryDto = z.infer<typeof journalEntrySchema>;

export const partySchema = z.object({
  code: z.string().max(30).optional(),
  type: z.enum(['customer', 'vendor', 'subcontractor']),
  name: z.string().min(2).max(200),
  contactPerson: optStr,
  phone: optStr,
  email: z.string().email().nullish().or(z.literal('')),
  address: optStr,
  binNo: optStr,
  tin: optStr,
  tradeLicense: optStr,
  creditLimit: nonNegDecimal.nullish(),
  paymentTermsDays: z.coerce.number().int().min(0).default(30),
  defaultTdsCodeId: optUuid,
  defaultVdsCodeId: optUuid,
  isActive: z.boolean().default(true),
  vendorCategory: optStr,
  bankName: optStr,
  bankBranch: optStr,
  bankAccountNo: optStr,
  routingNo: optStr,
});
export type PartyDto = z.infer<typeof partySchema>;

const docLineSchema = z.object({
  description: z.string().min(1),
  itemId: optUuid,
  quantity: positiveDecimal.default('1'),
  unitPrice: nonNegDecimal,
  vatCodeId: optUuid,
  accountId: optUuid, // income account (invoice) / expense account (bill)
});
export const invoiceSchema = z.object({
  partyId: uuid,
  date: isoDate,
  dueDate: isoDate.nullish(),
  projectId: optUuid,
  mushakNo: optStr,
  retentionAmount: nonNegDecimal.default('0'),
  advanceAdjustment: nonNegDecimal.default('0'),
  notes: optStr,
  lines: z.array(docLineSchema).min(1),
});
export type InvoiceDto = z.infer<typeof invoiceSchema>;

export const billSchema = z.object({
  partyId: uuid,
  vendorRef: optStr,
  date: isoDate,
  dueDate: isoDate.nullish(),
  projectId: optUuid,
  purchaseOrderId: optUuid,
  goodsReceiptId: optUuid,
  notes: optStr,
  lines: z.array(docLineSchema).min(1),
});
export type BillDto = z.infer<typeof billSchema>;

export const paymentSchema = z.object({
  direction: z.enum(['in', 'out']),
  partyId: uuid,
  date: isoDate,
  cashAccountId: uuid,
  method: z.enum(['cash', 'cheque', 'bank_transfer', 'mobile_banking']),
  chequeNo: optStr,
  reference: optStr,
  amount: positiveDecimal,
  tdsCodeId: optUuid,
  vdsCodeId: optUuid,
  /** Override the computed withholding (default: rate × amount) when the legal base differs, e.g. excludes VAT. */
  tdsAmount: nonNegDecimal.nullish(),
  vdsAmount: nonNegDecimal.nullish(),
  projectId: optUuid,
  notes: optStr,
  allocations: z
    .array(z.object({ invoiceId: optUuid, billId: optUuid, amount: positiveDecimal }))
    .default([]),
});
export type PaymentDto = z.infer<typeof paymentSchema>;

export const bankAccountSchema = z.object({
  accountCode: z.string().min(1).max(20),
  bankName: z.string().min(2),
  branchName: optStr,
  accountNo: z.string().min(3),
  routingNo: optStr,
  /** Balance already in the account when it is entered; posted against opening balance equity. */
  openingBalance: decimal.default('0'),
  openingDate: isoDate.nullish(),
});

export const taxCodeSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(2),
  kind: z.enum(['vat', 'tds', 'vds']),
  rate: nonNegDecimal,
  section: optStr,
  accountId: optUuid,
  isActive: z.boolean().default(true),
});

// ---------- inventory ----------
export const itemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(200),
  description: optStr,
  specification: optStr,
  categoryId: optUuid,
  uomId: uuid,
  type: z.enum(['stock', 'non_stock', 'service']).default('stock'),
  reorderLevel: nonNegDecimal.default('0'),
  standardCost: nonNegDecimal.nullish(),
  defaultVatCodeId: optUuid,
  isActive: z.boolean().default(true),
});
export type ItemDto = z.infer<typeof itemSchema>;

export const warehouseSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2).max(200),
  type: z.enum(['central', 'site']).default('central'),
  projectId: optUuid,
  address: optStr,
  managerId: optUuid,
  isActive: z.boolean().default(true),
});

export const stockDocumentSchema = z.object({
  type: z.enum(['issue', 'transfer', 'adjustment', 'opening']),
  date: isoDate,
  fromWarehouseId: optUuid,
  toWarehouseId: optUuid,
  projectId: optUuid,
  siteRequisitionId: optUuid,
  remarks: optStr,
  lines: z
    .array(
      z.object({
        itemId: uuid,
        quantity: decimal.refine((v) => Number(v) !== 0, 'Quantity cannot be 0'),
        unitCost: nonNegDecimal.nullish(),
        boqItemId: optUuid,
        remarks: optStr,
      }),
    )
    .min(1),
});
export type StockDocumentDto = z.infer<typeof stockDocumentSchema>;

// ---------- procurement ----------
export const purchaseRequisitionSchema = z.object({
  date: isoDate,
  requiredBy: isoDate.nullish(),
  projectId: optUuid,
  warehouseId: optUuid,
  siteRequisitionId: optUuid,
  remarks: optStr,
  lines: z
    .array(z.object({ itemId: uuid, quantity: positiveDecimal, estimatedRate: nonNegDecimal.nullish(), remarks: optStr }))
    .min(1),
});
export type PurchaseRequisitionDto = z.infer<typeof purchaseRequisitionSchema>;

export const purchaseOrderSchema = z.object({
  partyId: uuid,
  date: isoDate,
  expectedDate: isoDate.nullish(),
  projectId: optUuid,
  warehouseId: uuid,
  requisitionId: optUuid,
  terms: optStr,
  lines: z
    .array(
      z.object({
        itemId: uuid,
        description: optStr,
        quantity: positiveDecimal,
        unitPrice: nonNegDecimal,
        vatCodeId: optUuid,
      }),
    )
    .min(1),
});
export type PurchaseOrderDto = z.infer<typeof purchaseOrderSchema>;

export const goodsReceiptSchema = z.object({
  orderId: uuid,
  date: isoDate,
  warehouseId: optUuid,
  challanNo: optStr,
  remarks: optStr,
  lines: z.array(z.object({ orderLineId: uuid, quantity: positiveDecimal })).min(1),
});
export type GoodsReceiptDto = z.infer<typeof goodsReceiptSchema>;

// ---------- construction ----------
export const projectSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(2).max(200),
  clientId: optUuid,
  contractNo: optStr,
  contractValue: nonNegDecimal.default('0'),
  location: optStr,
  startDate: isoDate.nullish(),
  endDate: isoDate.nullish(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).default('planning'),
  projectManagerId: optUuid,
  retentionPercent: nonNegDecimal.default('0'),
  mobilizationAdvance: nonNegDecimal.default('0'),
  advanceRecoveryPercent: nonNegDecimal.default('0'),
  vatPercent: nonNegDecimal.default('0'),
  description: optStr,
  createSiteStore: z.boolean().default(true),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const boqItemSchema = z.object({
  parentId: optUuid,
  code: z.string().min(1).max(30),
  description: z.string().min(1),
  uom: optStr,
  quantity: nonNegDecimal.default('0'),
  rate: nonNegDecimal.default('0'),
  isSection: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
  materials: z
    .array(z.object({ itemId: uuid, qtyPerUnit: positiveDecimal, wastagePercent: nonNegDecimal.default('0') }))
    .default([]),
});
export type BoqItemDto = z.infer<typeof boqItemSchema>;

export const projectBudgetSchema = z.object({
  budgets: z.array(
    z.object({
      category: z.enum(['material', 'labor', 'subcontract', 'equipment', 'overhead']),
      amount: nonNegDecimal,
      notes: optStr,
    }),
  ),
});

export const projectTaskSchema = z.object({
  parentId: optUuid,
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(200),
  startDate: isoDate.nullish(),
  endDate: isoDate.nullish(),
  progress: nonNegDecimal.refine((v) => Number(v) <= 100, 'Max 100').default('0'),
  weight: positiveDecimal.default('1'),
  status: z.enum(['not_started', 'in_progress', 'done', 'blocked']).default('not_started'),
  assigneeId: optUuid,
  boqItemId: optUuid,
  sortOrder: z.coerce.number().int().default(0),
});
export type ProjectTaskDto = z.infer<typeof projectTaskSchema>;

export const siteRequisitionSchema = z.object({
  projectId: uuid,
  date: isoDate,
  requiredBy: isoDate.nullish(),
  remarks: optStr,
  lines: z.array(z.object({ itemId: uuid, quantity: positiveDecimal, boqItemId: optUuid, remarks: optStr })).min(1),
});
export type SiteRequisitionDto = z.infer<typeof siteRequisitionSchema>;

export const workOrderSchema = z.object({
  projectId: uuid,
  partyId: uuid,
  date: isoDate,
  scope: optStr,
  retentionPercent: nonNegDecimal.default('0'),
  lines: z
    .array(
      z.object({
        boqItemId: optUuid,
        description: z.string().min(1),
        uom: optStr,
        quantity: positiveDecimal,
        rate: nonNegDecimal,
      }),
    )
    .min(1),
});
export type WorkOrderDto = z.infer<typeof workOrderSchema>;

export const subcontractBillSchema = z.object({
  workOrderId: uuid,
  date: isoDate,
  periodFrom: isoDate.nullish(),
  periodTo: isoDate.nullish(),
  lines: z.array(z.object({ workOrderLineId: uuid, currentQty: positiveDecimal })).min(1),
});
export type SubcontractBillDto = z.infer<typeof subcontractBillSchema>;

export const raBillSchema = z.object({
  projectId: uuid,
  date: isoDate,
  periodFrom: isoDate.nullish(),
  periodTo: isoDate.nullish(),
  remarks: optStr,
  lines: z.array(z.object({ boqItemId: uuid, currentQty: positiveDecimal })).min(1),
});
export type RaBillDto = z.infer<typeof raBillSchema>;

export const dprSchema = z.object({
  projectId: uuid,
  date: isoDate,
  weather: optStr,
  workDone: z.string().min(1),
  manpower: z.array(z.object({ trade: z.string().min(1), count: z.coerce.number().int().min(0) })).default([]),
  issues: optStr,
  nextDayPlan: optStr,
});
export type DprDto = z.infer<typeof dprSchema>;

export const equipmentSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(2).max(200),
  type: optStr,
  ownership: z.enum(['owned', 'rented']).default('owned'),
  hourlyRate: nonNegDecimal.default('0'),
  currentProjectId: optUuid,
  status: z.enum(['available', 'in_use', 'maintenance', 'retired']).default('available'),
});

export const equipmentLogSchema = z.object({
  equipmentId: uuid,
  projectId: uuid,
  date: isoDate,
  hours: positiveDecimal,
  fuelLiters: nonNegDecimal.default('0'),
  operatorId: optUuid,
  remarks: optStr,
});

export const variationOrderSchema = z.object({
  projectId: uuid,
  date: isoDate,
  description: z.string().min(1),
  amount: decimal,
});
