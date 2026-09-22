/**
 * Bangladesh defaults for a construction company. Rates are starting points only —
 * tenants must verify against the current Finance Act / NBR SROs and edit in Settings.
 */

export interface SeedAccount {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  subtype?: string;
  group?: boolean;
  parent?: string;
}

export const CHART_OF_ACCOUNTS: SeedAccount[] = [
  { code: '1000', name: 'Assets', type: 'asset', group: true },
  { code: '1100', name: 'Current Assets', type: 'asset', group: true, parent: '1000' },
  { code: '1110', name: 'Cash in Hand', type: 'asset', subtype: 'cash', parent: '1100' },
  { code: '1120', name: 'Bank Accounts', type: 'asset', group: true, parent: '1100' },
  { code: '1121', name: 'Bank - Main Operating', type: 'asset', subtype: 'bank', parent: '1120' },
  { code: '1130', name: 'Accounts Receivable', type: 'asset', subtype: 'receivable', parent: '1100' },
  { code: '1140', name: 'Retention Receivable', type: 'asset', subtype: 'retention', parent: '1100' },
  { code: '1150', name: 'Inventory - Construction Materials', type: 'asset', subtype: 'inventory', parent: '1100' },
  { code: '1160', name: 'Advance to Suppliers & Subcontractors', type: 'asset', parent: '1100' },
  { code: '1170', name: 'VAT Current Account (Input)', type: 'asset', subtype: 'tax', parent: '1100' },
  { code: '1180', name: 'Advance Income Tax (AIT)', type: 'asset', subtype: 'tax', parent: '1100' },
  { code: '1190', name: 'Work in Progress', type: 'asset', subtype: 'wip', parent: '1100' },
  { code: '1195', name: 'Employee Advances', type: 'asset', parent: '1100' },
  { code: '1200', name: 'Fixed Assets', type: 'asset', group: true, parent: '1000' },
  { code: '1210', name: 'Plant & Machinery', type: 'asset', subtype: 'fixed_asset', parent: '1200' },
  { code: '1220', name: 'Vehicles', type: 'asset', subtype: 'fixed_asset', parent: '1200' },
  { code: '1230', name: 'Office Equipment & Furniture', type: 'asset', subtype: 'fixed_asset', parent: '1200' },
  { code: '1290', name: 'Accumulated Depreciation', type: 'asset', subtype: 'fixed_asset', parent: '1200' },

  { code: '2000', name: 'Liabilities', type: 'liability', group: true },
  { code: '2100', name: 'Current Liabilities', type: 'liability', group: true, parent: '2000' },
  { code: '2110', name: 'Accounts Payable', type: 'liability', subtype: 'payable', parent: '2100' },
  { code: '2115', name: 'Goods Received Not Invoiced', type: 'liability', parent: '2100' },
  { code: '2120', name: 'Retention Payable', type: 'liability', subtype: 'retention', parent: '2100' },
  { code: '2130', name: 'VAT Payable (Output)', type: 'liability', subtype: 'tax', parent: '2100' },
  { code: '2140', name: 'TDS Payable', type: 'liability', subtype: 'tax', parent: '2100' },
  { code: '2150', name: 'VDS Payable', type: 'liability', subtype: 'tax', parent: '2100' },
  { code: '2160', name: 'Salary Payable', type: 'liability', parent: '2100' },
  { code: '2170', name: 'Provident Fund Payable', type: 'liability', parent: '2100' },
  { code: '2180', name: 'Mobilization Advance from Clients', type: 'liability', parent: '2100' },
  { code: '2190', name: 'Accrued Expenses', type: 'liability', parent: '2100' },
  { code: '2200', name: 'Long-term Loans', type: 'liability', parent: '2000' },

  { code: '3000', name: 'Equity', type: 'equity', group: true },
  { code: '3100', name: 'Share Capital', type: 'equity', parent: '3000' },
  { code: '3200', name: 'Retained Earnings', type: 'equity', parent: '3000' },

  { code: '4000', name: 'Income', type: 'income', group: true },
  { code: '4100', name: 'Contract Revenue', type: 'income', parent: '4000' },
  { code: '4200', name: 'Other Income', type: 'income', parent: '4000' },

  { code: '5000', name: 'Direct Project Costs', type: 'expense', group: true },
  { code: '5100', name: 'Material Cost', type: 'expense', parent: '5000' },
  { code: '5200', name: 'Labor Cost & Wages', type: 'expense', parent: '5000' },
  { code: '5300', name: 'Subcontract Cost', type: 'expense', parent: '5000' },
  { code: '5400', name: 'Equipment & Machinery Cost', type: 'expense', parent: '5000' },
  { code: '5500', name: 'Site Overhead', type: 'expense', parent: '5000' },

  { code: '6000', name: 'Operating Expenses', type: 'expense', group: true },
  { code: '6100', name: 'Salaries & Allowances', type: 'expense', parent: '6000' },
  { code: '6110', name: 'Employer PF Contribution', type: 'expense', parent: '6000' },
  { code: '6120', name: 'Festival Bonus', type: 'expense', parent: '6000' },
  { code: '6200', name: 'Office Rent', type: 'expense', parent: '6000' },
  { code: '6300', name: 'Utilities', type: 'expense', parent: '6000' },
  { code: '6400', name: 'Travel & Conveyance', type: 'expense', parent: '6000' },
  { code: '6500', name: 'Bank Charges', type: 'expense', parent: '6000' },
  { code: '6600', name: 'Depreciation', type: 'expense', parent: '6000' },
  { code: '6700', name: 'Inventory Adjustment (Gain)/Loss', type: 'expense', parent: '6000' },
  { code: '6900', name: 'Miscellaneous Expenses', type: 'expense', parent: '6000' },
];

/** Posting-engine roles → account code. */
export const ACCOUNT_MAPPINGS: Record<string, string> = {
  cash: '1110',
  bank_default: '1121',
  ar: '1130',
  retention_receivable: '1140',
  inventory: '1150',
  supplier_advance: '1160',
  vat_input: '1170',
  ait_receivable: '1180',
  ap: '2110',
  grni: '2115',
  retention_payable: '2120',
  vat_output: '2130',
  tds_payable: '2140',
  vds_payable: '2150',
  salary_payable: '2160',
  pf_payable: '2170',
  client_advance: '2180',
  retained_earnings: '3200',
  revenue: '4100',
  material_cost: '5100',
  labor_cost: '5200',
  subcontract_cost: '5300',
  equipment_cost: '5400',
  salary_expense: '6100',
  pf_expense: '6110',
  bonus_expense: '6120',
  stock_adjustment: '6700',
};

export const TAX_CODES = [
  { code: 'VAT-15', name: 'VAT 15% (standard)', kind: 'vat', rate: '15', mapping: 'vat_output' },
  { code: 'VAT-10', name: 'VAT 10% (reduced)', kind: 'vat', rate: '10', mapping: 'vat_output' },
  { code: 'VAT-7.5', name: 'VAT 7.5% (construction services)', kind: 'vat', rate: '7.5', mapping: 'vat_output' },
  { code: 'VAT-5', name: 'VAT 5% (reduced)', kind: 'vat', rate: '5', mapping: 'vat_output' },
  { code: 'VAT-0', name: 'VAT Exempt', kind: 'vat', rate: '0', mapping: 'vat_output' },
  { code: 'TDS-SUPPLY', name: 'TDS on supply of goods', kind: 'tds', rate: '5', section: '89', mapping: 'tds_payable' },
  { code: 'TDS-CONTRACT', name: 'TDS on contract / works', kind: 'tds', rate: '7', section: '89', mapping: 'tds_payable' },
  { code: 'TDS-SERVICE', name: 'TDS on services', kind: 'tds', rate: '10', section: '90', mapping: 'tds_payable' },
  { code: 'TDS-RENT', name: 'TDS on house rent', kind: 'tds', rate: '5', section: '109', mapping: 'tds_payable' },
  { code: 'VDS-7.5', name: 'VDS construction 7.5%', kind: 'vds', rate: '7.5', mapping: 'vds_payable' },
  { code: 'VDS-15', name: 'VDS standard 15%', kind: 'vds', rate: '15', mapping: 'vds_payable' },
] as const;

export const UOMS: [string, string][] = [
  ['pcs', 'Pieces'], ['nos', 'Numbers'], ['bag', 'Bag (50kg)'], ['kg', 'Kilogram'], ['ton', 'Metric Ton'],
  ['cft', 'Cubic Feet'], ['cum', 'Cubic Meter'], ['sft', 'Square Feet'], ['sqm', 'Square Meter'],
  ['rft', 'Running Feet'], ['m', 'Meter'], ['ltr', 'Litre'], ['set', 'Set'], ['bundle', 'Bundle'],
  ['truck', 'Truck Load'], ['ls', 'Lump Sum'], ['hr', 'Hour'], ['day', 'Day'],
];

export const ITEM_CATEGORIES: [string, string][] = [
  ['CEM', 'Cement'], ['STL', 'Steel & Rebar'], ['AGG', 'Aggregates (Sand/Stone/Brick chips)'],
  ['BRK', 'Bricks & Blocks'], ['ELC', 'Electrical'], ['PLB', 'Plumbing & Sanitary'],
  ['FIN', 'Finishing (Tiles/Paint)'], ['WOD', 'Wood & Formwork'], ['FUL', 'Fuel & Lubricants'],
  ['CON', 'Consumables & Tools'],
];

/** Bangladesh Labour Act 2006 defaults. */
export const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', daysPerYear: 10, isPaid: true, carryForward: false },
  { code: 'SL', name: 'Sick Leave', daysPerYear: 14, isPaid: true, carryForward: false },
  { code: 'AL', name: 'Annual (Earned) Leave', daysPerYear: 17, isPaid: true, carryForward: true },
  { code: 'ML', name: 'Maternity Leave', daysPerYear: 112, isPaid: true, carryForward: false },
  { code: 'LWP', name: 'Leave Without Pay', daysPerYear: 365, isPaid: false, carryForward: false },
];

/** Individual income-tax slabs (annual, BDT). Edit per Finance Act. */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  'company.currency': 'BDT',
  'company.fiscal_year_start_month': 7,
  'payroll.tax_slabs': [
    { upTo: 350000, rate: 0 },
    { upTo: 450000, rate: 5 },
    { upTo: 850000, rate: 10 },
    { upTo: 1350000, rate: 15 },
    { upTo: 1850000, rate: 20 },
    { upTo: 3850000, rate: 25 },
    { upTo: null, rate: 30 },
  ],
  /** Exemption: lower of 1/3 of taxable income or this cap. */
  'payroll.tax_exemption_cap': 450000,
  'payroll.minimum_tax': 5000,
  /** Festival bonus as % of basic (two Eids per year, typically 100% basic each). */
  'payroll.festival_bonus_percent_of_basic': 100,
  'payroll.working_days_per_month': 26,
};
