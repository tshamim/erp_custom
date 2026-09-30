import {
  BarChart3,
  Boxes,
  Building2,
  FileSignature,
  FolderOpen,
  Handshake,
  HardHat,
  LayoutDashboard,
  Landmark,
  LucideIcon,
  PiggyBank,
  Plane,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  perm?: string;
}
export interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  { label: 'Overview', icon: LayoutDashboard, items: [{ label: 'Dashboard', href: '/' }] },
  {
    label: 'Construction',
    icon: HardHat,
    items: [
      { label: 'Projects', href: '/projects', perm: 'construction.project.read' },
      { label: 'Site Requisitions', href: '/m/site-requisitions', perm: 'construction.requisition.read' },
      { label: 'Work Orders', href: '/m/work-orders', perm: 'construction.subcontract.read' },
      { label: 'RA Bills', href: '/m/ra-bills', perm: 'construction.rabill.read' },
      { label: 'Equipment', href: '/m/equipment', perm: 'construction.equipment.read' },
    ],
  },
  {
    label: 'HR',
    icon: Users,
    items: [
      { label: 'Employees', href: '/m/employees', perm: 'hr.employee.read' },
      { label: 'Attendance', href: '/hr/attendance', perm: 'hr.attendance.read' },
      { label: 'Leave Requests', href: '/m/leave-requests', perm: 'hr.leave.read' },
      { label: 'Departments', href: '/m/departments', perm: 'hr.department.read' },
      { label: 'Designations', href: '/m/designations', perm: 'hr.designation.read' },
      { label: 'Holidays', href: '/m/holidays', perm: 'hr.attendance.read' },
      { label: 'Leave Types', href: '/m/leave-types', perm: 'hr.leave.read' },
    ],
  },
  {
    label: 'Payroll',
    icon: Wallet,
    items: [
      { label: 'Salary Structures', href: '/payroll/structures', perm: 'payroll.structure.read' },
      { label: 'Payroll Runs', href: '/payroll', perm: 'payroll.run.read' },
    ],
  },
  {
    label: 'Procurement',
    icon: ShoppingCart,
    items: [
      { label: 'Purchase Requisitions', href: '/m/purchase-requisitions', perm: 'procurement.requisition.read' },
      { label: 'Purchase Orders', href: '/m/purchase-orders', perm: 'procurement.order.read' },
      { label: 'Goods Receipts', href: '/m/goods-receipts', perm: 'procurement.receipt.read' },
    ],
  },
  {
    label: 'Vendors',
    icon: Handshake,
    items: [
      { label: 'Vendors & Subcontractors', href: '/vendors', perm: 'vendor.vendor.read' },
      { label: 'Compliance', href: '/vendors/compliance', perm: 'vendor.vendor.read' },
    ],
  },
  {
    label: 'Inventory',
    icon: Boxes,
    items: [
      { label: 'Items', href: '/m/items', perm: 'inventory.item.read' },
      { label: 'Stock on Hand', href: '/inventory/stock', perm: 'inventory.report.read' },
      { label: 'Stock Documents', href: '/m/stock-documents', perm: 'inventory.movement.read' },
      { label: 'Warehouses', href: '/m/warehouses', perm: 'inventory.warehouse.read' },
      { label: 'Item Categories', href: '/m/item-categories', perm: 'inventory.item.read' },
      { label: 'Units', href: '/m/uoms', perm: 'inventory.item.read' },
    ],
  },
  {
    label: 'Finance',
    icon: Landmark,
    items: [
      { label: 'Customers & Vendors', href: '/m/parties', perm: 'finance.party.read' },
      { label: 'Sales Invoices', href: '/m/invoices', perm: 'finance.invoice.read' },
      { label: 'Vendor Bills', href: '/m/bills', perm: 'finance.bill.read' },
      { label: 'Receipts & Payments', href: '/m/payments', perm: 'finance.payment.read' },
      { label: 'Journal Entries', href: '/m/journals', perm: 'finance.journal.read' },
      { label: 'Chart of Accounts', href: '/finance/accounts', perm: 'finance.account.read' },
      { label: 'Bank Accounts', href: '/finance/bank', perm: 'finance.payment.read' },
      { label: 'Tax Codes', href: '/m/tax-codes', perm: 'finance.account.read' },
      { label: 'Fiscal Years', href: '/finance/fiscal', perm: 'finance.fiscal.read' },
    ],
  },
  {
    label: 'Quotations',
    icon: FileSignature,
    items: [{ label: 'Quotations & Tenders', href: '/m/quotations', perm: 'quotation.quotation.read' }],
  },
  {
    label: 'Investors',
    icon: PiggyBank,
    items: [
      { label: 'Investors', href: '/investors', perm: 'investor.investor.read' },
      { label: 'Agreements', href: '/m/investor-agreements', perm: 'investor.agreement.read' },
      { label: 'Money In & Out', href: '/m/investor-transactions', perm: 'investor.transaction.read' },
      { label: 'Profit Sharing', href: '/investors/entitlements', perm: 'investor.report.read' },
    ],
  },
  {
    label: 'EB-3 Visa',
    icon: Plane,
    items: [
      { label: 'Case Board', href: '/eb3', perm: 'eb3.case.read' },
      { label: 'Candidates', href: '/m/eb3-candidates', perm: 'eb3.candidate.read' },
      { label: 'US Employers', href: '/m/eb3-employers', perm: 'eb3.employer.read' },
      { label: 'Job Orders', href: '/m/eb3-job-orders', perm: 'eb3.joborder.read' },
      { label: 'Fees', href: '/m/eb3-payments', perm: 'eb3.payment.read' },
    ],
  },
  {
    label: 'Documents',
    icon: FolderOpen,
    items: [
      { label: 'Company Documents', href: '/m/company-documents', perm: 'document.document.read' },
      { label: 'Expiring Soon', href: '/documents/expiring', perm: 'document.document.read' },
      { label: 'Media Gallery', href: '/documents/gallery', perm: 'document.document.read' },
    ],
  },
  { label: 'Reports', icon: BarChart3, items: [{ label: 'Financial & Stock Reports', href: '/reports', perm: 'finance.report.read' }] },
  {
    label: 'Administration',
    icon: Settings,
    items: [
      { label: 'Users', href: '/m/users', perm: 'core.user.read' },
      { label: 'Roles & Permissions', href: '/admin/roles', perm: 'core.role.read' },
      { label: 'Branches', href: '/m/branches', perm: 'core.branch.read' },
      { label: 'Audit Log', href: '/admin/audit', perm: 'core.audit.read' },
      { label: 'Company Settings', href: '/admin/settings', perm: 'core.settings.update' },
    ],
  },
];

export const BrandIcon = Building2;
