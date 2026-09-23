/**
 * Permission keys follow `module.resource.action`.
 * The seed script inserts every key into each tenant DB; the Admin role receives all of them.
 */
const crud = (m: string, r: string) =>
  [`${m}.${r}.read`, `${m}.${r}.create`, `${m}.${r}.update`, `${m}.${r}.delete`] as const;

export const PERMISSIONS = [
  ...crud('core', 'user'),
  ...crud('core', 'role'),
  ...crud('core', 'branch'),
  'core.audit.read',
  'core.settings.update',

  ...crud('hr', 'department'),
  ...crud('hr', 'designation'),
  ...crud('hr', 'employee'),
  ...crud('hr', 'attendance'),
  ...crud('hr', 'leave'),
  'hr.leave.approve',

  ...crud('payroll', 'structure'),
  ...crud('payroll', 'run'),
  'payroll.run.finalize',

  ...crud('finance', 'account'),
  ...crud('finance', 'journal'),
  'finance.journal.post',
  ...crud('finance', 'party'),
  ...crud('finance', 'invoice'),
  ...crud('finance', 'bill'),
  ...crud('finance', 'payment'),
  ...crud('finance', 'fiscal'),
  'finance.report.read',

  ...crud('inventory', 'item'),
  ...crud('inventory', 'warehouse'),
  ...crud('inventory', 'movement'),
  'inventory.report.read',

  ...crud('procurement', 'requisition'),
  ...crud('procurement', 'order'),
  ...crud('procurement', 'receipt'),
  'procurement.order.approve',

  ...crud('construction', 'project'),
  ...crud('construction', 'boq'),
  ...crud('construction', 'task'),
  ...crud('construction', 'requisition'),
  ...crud('construction', 'subcontract'),
  ...crud('construction', 'rabill'),
  'construction.rabill.approve',
  ...crud('construction', 'dpr'),
  ...crud('construction', 'equipment'),

  ...crud('vendor', 'vendor'),
  ...crud('vendor', 'evaluation'),
  'vendor.vendor.approve',

  'core.attachment.read',
  'core.attachment.create',
  'core.attachment.delete',
  'core.import.create',
] as const;

/**
 * Licensable modules. The platform owner switches them per tenant; permissions whose
 * prefix belongs to a disabled module are stripped from every user of that tenant.
 */
export const MODULES = {
  construction: { label: 'Construction & Projects', prefixes: ['construction'] },
  hr: { label: 'HR & Attendance', prefixes: ['hr'] },
  payroll: { label: 'Payroll', prefixes: ['payroll'] },
  finance: { label: 'Finance & Accounting', prefixes: ['finance'] },
  inventory: { label: 'Inventory', prefixes: ['inventory'] },
  procurement: { label: 'Procurement', prefixes: ['procurement'] },
  vendor: { label: 'Vendor Management', prefixes: ['vendor'] },
} as const;
export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** Module that owns a permission key, or null for always-on core permissions. */
export function moduleOf(permission: string): ModuleKey | null {
  const prefix = permission.split('.')[0];
  for (const k of MODULE_KEYS) if ((MODULES[k].prefixes as readonly string[]).includes(prefix)) return k;
  return null;
}

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES: Record<string, { description: string; permissions: Permission[] | '*' }> = {
  Admin: { description: 'Full access', permissions: '*' },
  Accountant: {
    description: 'Finance and reporting',
    permissions: PERMISSIONS.filter(
      (p) => p.startsWith('finance.') || p === 'inventory.report.read' || p === 'vendor.vendor.read' || p.startsWith('core.attachment') || p === 'core.import.create',
    ),
  },
  'Procurement Officer': {
    description: 'Vendors, requisitions, purchase orders',
    permissions: PERMISSIONS.filter(
      (p) => p.startsWith('vendor.') || p.startsWith('procurement.') || p === 'inventory.item.read' || p === 'finance.party.read' || p.startsWith('core.attachment'),
    ),
  },
  'HR Manager': {
    description: 'HR and payroll',
    permissions: PERMISSIONS.filter((p) => p.startsWith('hr.') || p.startsWith('payroll.') || p.startsWith('core.attachment')),
  },
  'Store Keeper': {
    description: 'Inventory and goods receipt',
    permissions: PERMISSIONS.filter(
      (p) => p.startsWith('inventory.') || p.startsWith('procurement.receipt') || p === 'procurement.requisition.read' || p.startsWith('core.attachment'),
    ),
  },
  'Project Manager': {
    description: 'Construction projects',
    permissions: PERMISSIONS.filter(
      (p) => p.startsWith('construction.') || p === 'inventory.item.read' || p.startsWith('procurement.requisition') || p.startsWith('core.attachment'),
    ),
  },
};
