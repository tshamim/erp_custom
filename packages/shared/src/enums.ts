export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const PARTY_TYPES = ['customer', 'vendor', 'subcontractor'] as const;
export const DOC_STATUS = ['draft', 'submitted', 'approved', 'posted', 'cancelled'] as const;
export type DocStatus = (typeof DOC_STATUS)[number];

export const PROJECT_STATUS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;
export const MOVEMENT_TYPES = ['receipt', 'issue', 'transfer_out', 'transfer_in', 'adjustment', 'opening'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'probation', 'daily_wage'] as const;
export const ATTENDANCE_STATUS = ['present', 'absent', 'late', 'half_day', 'leave', 'holiday'] as const;
export const LEAVE_STATUS = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export const TENANT_STATUS = ['provisioning', 'active', 'suspended', 'failed'] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];
