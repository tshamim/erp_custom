import type { ResourceDef } from './resource-types';

export const vendorDef: ResourceDef = {
  key: 'vendors',
  basePath: '/vendors',
  title: 'Vendors & Subcontractors',
  singular: 'Vendor',
  endpoint: '/vendors',
  perm: 'vendor.vendor',
  searchable: true,
  createHref: '/m/parties/new',
  detail: { fields: [] }, // rows link to the 360 page
  columns: [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type', format: 'status' },
    { key: 'vendorCategory', label: 'Category' },
    { key: 'vendorStatus', label: 'Status', format: 'status' },
    { key: 'rating', label: 'Rating', format: 'qty' },
    { key: 'purchases', label: 'Purchases', format: 'money' },
    { key: 'payable', label: 'Outstanding', format: 'money' },
    { key: 'expiredDocs', label: 'Expired docs' },
    { key: 'phone', label: 'Phone' },
  ],
  filters: [
    { name: 'status', label: 'Status', type: 'select', options: ['approved', 'pending', 'on_hold', 'blacklisted'] },
    { name: 'type', label: 'Type', type: 'select', options: ['vendor', 'subcontractor'] },
    { name: 'category', label: 'Category', type: 'select', source: { endpoint: '/vendors/categories' } },
  ],
};
