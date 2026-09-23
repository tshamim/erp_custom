/**
 * CSV import templates. Column names are the CSV headers; references use human codes
 * (unit code, category code, department code…), resolved server-side.
 */
export const IMPORT_TEMPLATES = {
  items: {
    label: 'Items & materials',
    perm: 'inventory.item.create',
    columns: ['code', 'name', 'unit', 'category', 'type', 'reorderLevel', 'standardCost', 'specification', 'vatCode'],
    required: ['code', 'name', 'unit'],
    example: ['CEM-PCC', 'PCC Cement 50kg', 'bag', 'CEM', 'stock', '100', '490', 'CEM-II', 'VAT-15'],
  },
  parties: {
    label: 'Customers / vendors / subcontractors',
    perm: 'finance.party.create',
    columns: ['type', 'code', 'name', 'contactPerson', 'phone', 'email', 'address', 'binNo', 'tin', 'vendorCategory', 'paymentTermsDays'],
    required: ['type', 'name'],
    example: ['vendor', '', 'Akij Cement Co.', 'Mr. Karim', '01711000000', 'sales@akij.test', 'Dhaka', '000123456-0101', '123456789012', 'Cement', '30'],
  },
  employees: {
    label: 'Employees',
    perm: 'hr.employee.create',
    columns: ['code', 'firstName', 'lastName', 'gender', 'phone', 'email', 'nid', 'department', 'designation', 'employmentType', 'joiningDate', 'dailyWage', 'bankAccountNo'],
    required: ['firstName', 'joiningDate'],
    example: ['', 'Abdul', 'Karim', 'male', '01811000000', '', '1990123456789', 'SITE', 'Mason', 'daily_wage', '2026-07-01', '900', ''],
  },
  departments: { label: 'Departments', perm: 'hr.department.create', columns: ['code', 'name'], required: ['code', 'name'], example: ['QA', 'Quality Assurance'] },
  designations: { label: 'Designations', perm: 'hr.designation.create', columns: ['name', 'grade'], required: ['name'], example: ['Surveyor', 'G5'] },
  warehouses: {
    label: 'Warehouses',
    perm: 'inventory.warehouse.create',
    columns: ['code', 'name', 'type', 'address'],
    required: ['code', 'name'],
    example: ['WH2', 'Chattogram Yard', 'central', 'Patenga'],
  },
  equipment: {
    label: 'Equipment',
    perm: 'construction.equipment.create',
    columns: ['code', 'name', 'type', 'ownership', 'hourlyRate'],
    required: ['code', 'name'],
    example: ['CRN-01', 'Tower Crane 8T', 'crane', 'rented', '3500'],
  },
  boq: {
    label: 'BOQ items (per project)',
    perm: 'construction.boq.create',
    needsProject: true,
    columns: ['code', 'description', 'uom', 'quantity', 'rate', 'isSection'],
    required: ['code', 'description'],
    example: ['3.1', 'Plaster (1:4) 12mm thick', 'sqm', '8500', '320', 'no'],
  },
  'opening-stock': {
    label: 'Opening stock',
    perm: 'inventory.movement.create',
    columns: ['warehouse', 'item', 'quantity', 'unitCost'],
    required: ['warehouse', 'item', 'quantity', 'unitCost'],
    example: ['CS', 'CEM-OPC', '500', '510'],
  },
} as const;

export type ImportResource = keyof typeof IMPORT_TEMPLATES;
export const IMPORT_RESOURCES = Object.keys(IMPORT_TEMPLATES) as ImportResource[];
