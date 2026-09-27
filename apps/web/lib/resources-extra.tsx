import Link from 'next/link';
import type { ColumnDef, FieldDef, ResourceDef, Row } from './resource-types';
import { today } from './format';

/**
 * Registry entries for investors & profit sharing, quotations, company documents and EB-3.
 * They are spread into RESOURCES, so every one of them gets the generic list, form and
 * document pages. Screens that need bespoke workflow (investor statement, project
 * entitlements, quotation win, EB-3 case board) have their own pages.
 */

const statusCol = (key = 'status'): ColumnDef => ({ key, label: 'Status', format: 'status' });
const statusFilter = (options: string[]): FieldDef => ({ name: 'status', label: 'Status', type: 'select', options });
const projectField: FieldDef = { name: 'projectId', label: 'Project', type: 'select', source: { lookup: 'projects', label: (r) => `${r.code} — ${r.name}` } };
const cashAccountField: FieldDef = {
  name: 'cashAccountId',
  label: 'Cash / bank account',
  type: 'select',
  required: true,
  source: { lookup: 'accounts', filter: (r: Row) => !r.isGroup && ['cash', 'bank'].includes(r.subtype), label: (r: Row) => `${r.code} — ${r.name}` },
};
const investorSource = { endpoint: '/investors?pageSize=200', label: (r: Row) => `${r.code} — ${r.name}` };
const agreementSource = { endpoint: '/investors/agreements?pageSize=200', label: (r: Row) => `${r.no} — ${r.investorName} · ${r.projectCode} (${r.profitSharePercent}%)` };
const employerSource = { endpoint: '/eb3/employers?pageSize=200', label: (r: Row) => `${r.code} — ${r.name}` };
const candidateSource = { endpoint: '/eb3/candidates?pageSize=200', label: (r: Row) => `${r.code} — ${r.fullName}` };
const caseSource = { endpoint: '/eb3/cases?pageSize=200', label: (r: Row) => `${r.no} — ${r.candidateName}` };
const docLink = (base: string, idKey: string, title: string): ColumnDef => ({
  key: idKey,
  label: title,
  render: (r) => (r[idKey] ? <Link className="text-brand-600 hover:underline" href={`${base}/${r[idKey]}`}>View →</Link> : '—'),
});

const DOC_CATEGORIES = [
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
];

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
];

export const EXTRA_RESOURCES: Record<string, ResourceDef> = {
  // ---------------- Investors ----------------
  investors: {
    key: 'investors',
    basePath: '/investors',
    createHref: '/m/investors/new',
    title: 'Investors',
    singular: 'Investor',
    endpoint: '/investors',
    perm: 'investor.investor',
    searchable: true,
    editable: true, // rows open the statement page; /m/investors/<id> edits the profile
    attachEntity: 'investor',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type', format: 'status' },
      { key: 'projects', label: 'Projects' },
      { key: 'committed', label: 'Committed', format: 'money' },
      { key: 'contributed', label: 'Contributed', format: 'money' },
      { key: 'profitBooked', label: 'Profit booked', format: 'money' },
      { key: 'paidOut', label: 'Paid out', format: 'money' },
      { key: 'balance', label: 'Balance', format: 'money' },
      statusCol(),
    ],
    filters: [statusFilter(['active', 'exited']), { name: 'type', label: 'Type', type: 'select', options: ['individual', 'company'] }],
    form: {
      fields: [
        { name: 'code', label: 'Investor code', hint: 'Leave blank to auto-generate', createOnly: true },
        { name: 'name', label: 'Name', required: true, span: 2 },
        { name: 'type', label: 'Type', type: 'select', options: ['individual', 'company'], default: 'individual' },
        { name: 'contactPerson', label: 'Contact person' },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'nid', label: 'NID' },
        { name: 'tin', label: 'TIN' },
        { name: 'passportNo', label: 'Passport No.' },
        { name: 'bankName', label: 'Bank' },
        { name: 'bankAccountNo', label: 'Bank account No.' },
        { name: 'status', label: 'Status', type: 'select', options: ['active', 'exited'], default: 'active' },
        { name: 'address', label: 'Address', type: 'textarea', span: 2 },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ],
    },
  },

  'investor-agreements': {
    key: 'investor-agreements',
    title: 'Investment Agreements',
    singular: 'Agreement',
    endpoint: '/investors/agreements',
    perm: 'investor.agreement',
    editable: true,
    attachEntity: 'investment_agreement',
    columns: [
      { key: 'no', label: 'No.' },
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'investorName', label: 'Investor' },
      { key: 'projectCode', label: 'Project', render: (r) => `${r.projectCode} — ${r.projectName}` },
      { key: 'committedAmount', label: 'Committed', format: 'money' },
      { key: 'profitSharePercent', label: 'Profit share %', format: 'qty' },
      { key: 'sharesLoss', label: 'Carries loss', format: 'bool' },
      { key: 'startDate', label: 'From', format: 'date' },
      { key: 'endDate', label: 'To', format: 'date' },
      statusCol(),
    ],
    filters: [statusFilter(['draft', 'active', 'closed', 'cancelled']), projectField, { name: 'investorId', label: 'Investor', type: 'select', source: investorSource }],
    form: {
      fields: [
        { name: 'investorId', label: 'Investor', type: 'select', source: investorSource, required: true, span: 2 },
        { ...projectField, required: true, span: 2 },
        { name: 'date', label: 'Agreement date', type: 'date', required: true, default: today() },
        { name: 'committedAmount', label: 'Committed amount', type: 'decimal', required: true },
        { name: 'profitSharePercent', label: 'Share of project profit (%)', type: 'decimal', required: true, hint: 'All investors on one project cannot exceed 100%' },
        { name: 'sharesLoss', label: 'Investor also carries losses', type: 'checkbox', default: true },
        { name: 'startDate', label: 'Effective from', type: 'date' },
        { name: 'endDate', label: 'Effective to', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: ['draft', 'active', 'closed', 'cancelled'], default: 'active' },
        { name: 'terms', label: 'Terms', type: 'textarea', span: 4 },
      ],
    },
  },

  'investor-transactions': {
    key: 'investor-transactions',
    title: 'Investor Money In & Out',
    singular: 'Transaction',
    endpoint: '/investors/transactions',
    perm: 'investor.transaction',
    searchable: true,
    noLink: true,
    columns: [
      { key: 'no', label: 'No.' },
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'investorName', label: 'Investor' },
      { key: 'projectName', label: 'Project' },
      { key: 'type', label: 'Type', format: 'status' },
      { key: 'amount', label: 'Amount', format: 'money' },
      { key: 'method', label: 'Method', format: 'status' },
      { key: 'reference', label: 'Reference' },
      { key: 'periodFrom', label: 'Period from', format: 'date' },
      { key: 'periodTo', label: 'Period to', format: 'date' },
      statusCol(),
      docLink('/m/journals', 'journalEntryId', 'Journal entry'),
    ],
    filters: [
      { name: 'type', label: 'Type', type: 'select', options: ['contribution', 'payout', 'profit_share', 'loss_share'] },
      statusFilter(['posted', 'cancelled']),
      { name: 'investorId', label: 'Investor', type: 'select', source: investorSource },
      projectField,
    ],
    form: {
      fields: [
        { name: 'investorId', label: 'Investor', type: 'select', source: investorSource, required: true, span: 2 },
        { name: 'type', label: 'Type', type: 'select', options: ['contribution', 'payout'], default: 'contribution', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
        { name: 'amount', label: 'Amount', type: 'decimal', required: true },
        cashAccountField,
        { name: 'agreementId', label: 'Against agreement', type: 'select', source: agreementSource, span: 2 },
        projectField,
        { name: 'method', label: 'Method', type: 'select', options: ['bank_transfer', 'cheque', 'cash', 'mobile_banking'], default: 'bank_transfer' },
        { name: 'reference', label: 'Reference' },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 4 },
      ],
    },
    rowActions: [
      {
        label: 'Cancel',
        path: (r) => `/investors/transactions/${r.id}`,
        method: 'delete',
        when: (r) => r.status === 'posted',
        perm: 'investor.transaction.delete',
        variant: 'danger',
        confirm: 'Cancel this transaction? The journal entry will be reversed.',
      },
    ],
  },

  // ---------------- Quotations ----------------
  quotations: {
    key: 'quotations',
    title: 'Quotations & Tenders',
    singular: 'Quotation',
    endpoint: '/quotations',
    perm: 'quotation.quotation',
    searchable: true,
    attachEntity: 'quotation',
    columns: [
      { key: 'no', label: 'No.' },
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'title', label: 'Work' },
      { key: 'clientName', label: 'Client' },
      { key: 'subtotal', label: 'Work value', format: 'money' },
      { key: 'total', label: 'Quoted total', format: 'money' },
      { key: 'validUntil', label: 'Valid until', format: 'date' },
      statusCol(),
      { key: 'projectCode', label: 'Project' },
    ],
    filters: [
      statusFilter(['draft', 'sent', 'won', 'lost', 'expired', 'cancelled']),
      { name: 'partyId', label: 'Client', type: 'select', source: { endpoint: '/parties?pageSize=200&type=customer', label: (r: Row) => r.name } },
    ],
    form: {
      fields: [
        { name: 'title', label: 'Work / tender title', required: true, span: 2 },
        { name: 'clientId', label: 'Client', type: 'select', source: { endpoint: '/parties?pageSize=200&type=customer', label: (r: Row) => r.name }, span: 2 },
        { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
        { name: 'validUntil', label: 'Valid until', type: 'date' },
        { name: 'location', label: 'Location' },
        { name: 'projectCode', label: 'Intended project code', hint: 'Used when the quotation is won' },
        { name: 'discount', label: 'Discount', type: 'decimal', default: '0' },
        { name: 'vatPercent', label: 'VAT %', type: 'decimal', default: '15' },
        { name: 'retentionPercent', label: 'Retention %', type: 'decimal', default: '0' },
        { name: 'terms', label: 'Terms & conditions', type: 'textarea', span: 4 },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 4 },
      ],
      lines: {
        columns: [
          { name: 'lineNo', label: 'Item No.', width: '10%' },
          { name: 'description', label: 'Description of work', width: '40%' },
          { name: 'uom', label: 'Unit', width: '10%' },
          { name: 'quantity', label: 'Quantity', type: 'decimal', width: '12%' },
          { name: 'rate', label: 'Rate', type: 'decimal', width: '14%' },
        ],
        newLine: () => ({ lineNo: '', description: '', uom: '', quantity: '1', rate: '', isSection: false }),
        amount: (l) => Number(l.quantity || 0) * Number(l.rate || 0),
      },
    },
    detail: {
      fields: [
        { key: 'no', label: 'Quotation No.' },
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'validUntil', label: 'Valid until', format: 'date' },
        { key: 'clientName', label: 'Client' },
        { key: 'title', label: 'Work' },
        { key: 'location', label: 'Location' },
        statusCol(),
        { key: 'subtotal', label: 'Work value', format: 'money' },
        { key: 'discount', label: 'Less discount', format: 'money' },
        { key: 'vatAmount', label: 'VAT', format: 'money' },
        { key: 'total', label: 'Quoted total', format: 'money' },
        { key: 'retentionPercent', label: 'Retention %', format: 'qty' },
        { key: 'lostReason', label: 'Lost because' },
      ],
      lines: {
        key: 'lines',
        columns: [
          { key: 'lineNo', label: 'Item' },
          { key: 'description', label: 'Description' },
          { key: 'uom', label: 'Unit' },
          { key: 'quantity', label: 'Quantity', format: 'qty' },
          { key: 'rate', label: 'Rate', format: 'money' },
          { key: 'amount', label: 'Amount', format: 'money' },
        ],
      },
      actions: [
        { label: 'Mark as sent', path: (r) => `/quotations/${r.id}/status`, body: () => ({ status: 'sent' }), when: (r) => r.status === 'draft', perm: 'quotation.quotation.update' },
        {
          label: 'Mark as lost',
          path: (r) => `/quotations/${r.id}/status`,
          body: () => ({ status: 'lost' }),
          when: (r) => ['draft', 'sent'].includes(r.status),
          perm: 'quotation.quotation.update',
          variant: 'danger',
        },
      ],
      extra: (r) =>
        r.status === 'won' ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Won — project{' '}
            <Link className="font-medium hover:underline" href={`/projects/${r.wonProjectId}`}>
              {r.projectCodeWon}
            </Link>{' '}
            was created from this quotation with its BOQ.
          </div>
        ) : ['draft', 'sent'].includes(r.status) ? (
          <div className="no-print flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span>Won the work? Convert it straight into a project with this BOQ.</span>
            <Link className="font-medium text-brand-600 hover:underline" href={`/quotations/${r.id}/win`}>
              Convert to project →
            </Link>
          </div>
        ) : null,
    },
  },

  // ---------------- Company documents ----------------
  'company-documents': {
    key: 'company-documents',
    title: 'Company Documents & Media',
    singular: 'Document',
    endpoint: '/company-documents',
    perm: 'document.document',
    searchable: true,
    editable: true,
    attachEntity: 'company_document',
    columns: [
      { key: 'category', label: 'Category', format: 'status' },
      { key: 'title', label: 'Title' },
      { key: 'docNo', label: 'Document No.' },
      { key: 'issuedBy', label: 'Issued by' },
      { key: 'issueDate', label: 'Issued', format: 'date' },
      { key: 'expiryDate', label: 'Expires', format: 'date' },
      { key: 'state', label: 'Validity', format: 'status' },
      { key: 'files', label: 'Files' },
      { key: 'projectName', label: 'Project' },
      { key: 'isConfidential', label: 'Confidential', format: 'bool' },
    ],
    filters: [{ name: 'category', label: 'Category', type: 'select', options: DOC_CATEGORIES }, projectField],
    form: {
      fields: [
        { name: 'category', label: 'Category', type: 'select', options: DOC_CATEGORIES, required: true },
        { name: 'title', label: 'Title', required: true, span: 2 },
        { name: 'docNo', label: 'Document No.' },
        { name: 'issuedBy', label: 'Issued by' },
        { name: 'issueDate', label: 'Issue date', type: 'date' },
        { name: 'expiryDate', label: 'Expiry date', type: 'date', hint: 'Anything expiring within 30 days is flagged' },
        projectField,
        { name: 'isConfidential', label: 'Confidential', type: 'checkbox', default: false },
        { name: 'remarks', label: 'Remarks', type: 'textarea', span: 4 },
      ],
    },
  },

  // ---------------- EB-3 ----------------
  'eb3-employers': {
    key: 'eb3-employers',
    title: 'US Employers',
    singular: 'Employer',
    endpoint: '/eb3/employers',
    perm: 'eb3.employer',
    searchable: true,
    editable: true,
    attachEntity: 'eb3_employer',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Employer' },
      { key: 'industry', label: 'Industry' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'contactPerson', label: 'Contact' },
      { key: 'openJobOrders', label: 'Open orders' },
      { key: 'openPositions', label: 'Vacancies' },
      { key: 'activeCases', label: 'Live cases' },
      statusCol(),
    ],
    filters: [statusFilter(['active', 'inactive'])],
    form: {
      fields: [
        { name: 'code', label: 'Code', required: true },
        { name: 'name', label: 'Employer name', required: true, span: 2 },
        { name: 'industry', label: 'Industry' },
        { name: 'contactPerson', label: 'Contact person' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Phone' },
        { name: 'fein', label: 'FEIN' },
        { name: 'city', label: 'City' },
        { name: 'state', label: 'State' },
        { name: 'attorneyName', label: 'Attorney' },
        { name: 'attorneyEmail', label: 'Attorney email', type: 'email' },
        { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], default: 'active' },
        { name: 'address', label: 'Address', type: 'textarea', span: 2 },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ],
    },
  },

  'eb3-job-orders': {
    key: 'eb3-job-orders',
    title: 'Job Orders',
    singular: 'Job Order',
    endpoint: '/eb3/job-orders',
    perm: 'eb3.joborder',
    searchable: true,
    editable: true,
    columns: [
      { key: 'no', label: 'No.' },
      { key: 'employerName', label: 'Employer' },
      { key: 'title', label: 'Position' },
      { key: 'socCode', label: 'SOC' },
      { key: 'positions', label: 'Seats' },
      { key: 'filledPositions', label: 'Filled' },
      { key: 'vacancies', label: 'Vacant' },
      { key: 'offeredWage', label: 'Wage', format: 'money' },
      { key: 'wageUnit', label: 'Per', format: 'status' },
      { key: 'worksiteCity', label: 'Worksite' },
      { key: 'openedDate', label: 'Opened', format: 'date' },
      statusCol(),
    ],
    filters: [statusFilter(['open', 'filled', 'on_hold', 'closed'])],
    form: {
      fields: [
        { name: 'employerId', label: 'Employer', type: 'select', source: employerSource, required: true, span: 2 },
        { name: 'title', label: 'Position title', required: true, span: 2 },
        { name: 'socCode', label: 'SOC code' },
        { name: 'positions', label: 'Seats', type: 'number', default: 1, required: true },
        { name: 'offeredWage', label: 'Offered wage', type: 'decimal' },
        { name: 'wageUnit', label: 'Per', type: 'select', options: ['hour', 'week', 'month', 'year'], default: 'hour' },
        { name: 'worksiteCity', label: 'Worksite city' },
        { name: 'worksiteState', label: 'Worksite state' },
        { name: 'openedDate', label: 'Opened on', type: 'date', default: today() },
        { name: 'status', label: 'Status', type: 'select', options: ['open', 'filled', 'on_hold', 'closed'], default: 'open' },
        { name: 'requirements', label: 'Requirements', type: 'textarea', span: 4 },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 4 },
      ],
    },
  },

  'eb3-candidates': {
    key: 'eb3-candidates',
    title: 'Candidates',
    singular: 'Candidate',
    endpoint: '/eb3/candidates',
    perm: 'eb3.candidate',
    searchable: true,
    editable: true,
    attachEntity: 'eb3_candidate',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'fullName', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'district', label: 'District' },
      { key: 'passportNo', label: 'Passport' },
      { key: 'passportExpiry', label: 'Passport expiry', format: 'date' },
      { key: 'skill', label: 'Skill' },
      { key: 'englishLevel', label: 'English', format: 'status' },
      { key: 'caseNo', label: 'Case' },
      { key: 'caseStage', label: 'Stage', format: 'status' },
      { key: 'paidIn', label: 'Net paid', format: 'money' },
      statusCol(),
    ],
    filters: [statusFilter(['lead', 'screening', 'selected', 'case_open', 'visa_issued', 'departed', 'rejected', 'withdrawn'])],
    form: {
      fields: [
        { name: 'code', label: 'Candidate code', hint: 'Leave blank to auto-generate', createOnly: true },
        { name: 'fullName', label: 'Full name (as in passport)', required: true, span: 2 },
        { name: 'fatherName', label: "Father's name" },
        { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
        { name: 'gender', label: 'Gender', type: 'select', options: ['male', 'female', 'other'] },
        { name: 'maritalStatus', label: 'Marital status' },
        { name: 'dependents', label: 'Dependents', type: 'number', default: 0 },
        { name: 'nid', label: 'NID' },
        { name: 'passportNo', label: 'Passport No.' },
        { name: 'passportIssueDate', label: 'Passport issued', type: 'date' },
        { name: 'passportExpiry', label: 'Passport expires', type: 'date' },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'district', label: 'District' },
        { name: 'education', label: 'Education' },
        { name: 'experienceYears', label: 'Experience (years)', type: 'number' },
        { name: 'skill', label: 'Skill / trade' },
        { name: 'englishLevel', label: 'English', type: 'select', options: ['none', 'basic', 'conversational', 'fluent'] },
        { name: 'source', label: 'Source' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: ['lead', 'screening', 'selected', 'case_open', 'visa_issued', 'departed', 'rejected', 'withdrawn'],
          default: 'lead',
        },
        { name: 'address', label: 'Address', type: 'textarea', span: 2 },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ],
    },
  },

  'eb3-payments': {
    key: 'eb3-payments',
    title: 'EB-3 Fees',
    singular: 'Fee',
    endpoint: '/eb3/payments',
    perm: 'eb3.payment',
    searchable: true,
    noLink: true,
    columns: [
      { key: 'no', label: 'No.' },
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'candidateName', label: 'Candidate' },
      { key: 'caseNo', label: 'Case' },
      { key: 'type', label: 'Type', format: 'status' },
      { key: 'direction', label: 'In / out', format: 'status' },
      { key: 'amount', label: 'Amount', format: 'money' },
      { key: 'method', label: 'Method', format: 'status' },
      { key: 'reference', label: 'Reference' },
      statusCol(),
    ],
    filters: [{ name: 'type', label: 'Type', type: 'select', options: ['service_fee', 'government_fee', 'attorney_fee', 'medical', 'travel', 'refund'] }],
    form: {
      fields: [
        { name: 'candidateId', label: 'Candidate', type: 'select', source: candidateSource, required: true, span: 2 },
        { name: 'caseId', label: 'Case', type: 'select', source: caseSource, span: 2 },
        { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
        { name: 'type', label: 'Type', type: 'select', options: ['service_fee', 'government_fee', 'attorney_fee', 'medical', 'travel', 'refund'], default: 'service_fee', required: true },
        { name: 'direction', label: 'Direction', type: 'select', options: ['in', 'out'], default: 'in', hint: 'In = received from the candidate, out = paid on their behalf' },
        { name: 'amount', label: 'Amount', type: 'decimal', required: true },
        cashAccountField,
        { name: 'method', label: 'Method', type: 'select', options: ['cash', 'bank_transfer', 'cheque', 'mobile_banking'], default: 'cash' },
        { name: 'reference', label: 'Reference' },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 4 },
      ],
    },
  },
};
