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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES: Record<string, { description: string; permissions: Permission[] | '*' }> = {
  Admin: { description: 'Full access', permissions: '*' },
  Accountant: {
    description: 'Finance and reporting',
    permissions: PERMISSIONS.filter((p) => p.startsWith('finance.') || p === 'inventory.report.read'),
  },
  'HR Manager': {
    description: 'HR and payroll',
    permissions: PERMISSIONS.filter((p) => p.startsWith('hr.') || p.startsWith('payroll.')),
  },
  'Store Keeper': {
    description: 'Inventory and goods receipt',
    permissions: PERMISSIONS.filter(
      (p) => p.startsWith('inventory.') || p.startsWith('procurement.receipt') || p === 'procurement.requisition.read',
    ),
  },
  'Project Manager': {
    description: 'Construction projects',
    permissions: PERMISSIONS.filter(
      (p) => p.startsWith('construction.') || p === 'inventory.item.read' || p.startsWith('procurement.requisition'),
    ),
  },
};
