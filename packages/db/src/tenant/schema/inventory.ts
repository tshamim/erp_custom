import { pgTable, varchar, text, boolean, uuid, date, integer, index, unique } from 'drizzle-orm/pg-core';
import { id, timestamps, money, qty, rate } from './_common';
import { accounts, journalEntries, parties, taxCodes } from './finance';

export const uoms = pgTable('uoms', {
  id: id(),
  code: varchar('code', { length: 20 }).notNull().unique(), // bag, cft, rft, kg, ton, pcs, sqft
  name: varchar('name', { length: 100 }).notNull(),
  ...timestamps(),
});

export const itemCategories = pgTable('item_categories', {
  id: id(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  parentId: uuid('parent_id'),
  inventoryAccountId: uuid('inventory_account_id').references(() => accounts.id),
  expenseAccountId: uuid('expense_account_id').references(() => accounts.id),
  ...timestamps(),
});

export const items = pgTable(
  'items',
  {
    id: id(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    specification: text('specification'), // e.g. "60 grade, 12mm"
    categoryId: uuid('category_id').references(() => itemCategories.id),
    uomId: uuid('uom_id').notNull().references(() => uoms.id),
    type: varchar('type', { length: 20 }).notNull().default('stock'), // stock | non_stock | service
    reorderLevel: qty('reorder_level').notNull().default('0'),
    standardCost: money('standard_cost'),
    defaultVatCodeId: uuid('default_vat_code_id').references(() => taxCodes.id),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('items_category_idx').on(t.categoryId)],
);

export const warehouses = pgTable('warehouses', {
  id: id(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('central'), // central | site
  projectId: uuid('project_id'),
  address: text('address'),
  managerId: uuid('manager_id'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
});

/** Current on-hand + weighted-average cost per item per warehouse. Maintained only by StockService. */
export const stockBalances = pgTable(
  'stock_balances',
  {
    id: id(),
    itemId: uuid('item_id').notNull().references(() => items.id),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    quantity: qty('quantity').notNull().default('0'),
    avgCost: rate('avg_cost').notNull().default('0'),
    value: money('value').notNull().default('0'),
    ...timestamps(),
  },
  (t) => [unique('stock_bal_uniq').on(t.itemId, t.warehouseId)],
);

/** Immutable stock ledger. quantity is signed (+in / -out). */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    date: date('date').notNull(),
    type: varchar('type', { length: 20 }).notNull(), // receipt | issue | transfer_out | transfer_in | adjustment | opening
    itemId: uuid('item_id').notNull().references(() => items.id),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    quantity: qty('quantity').notNull(),
    unitCost: rate('unit_cost').notNull(),
    value: money('value').notNull(),
    balanceQty: qty('balance_qty').notNull(),
    balanceValue: money('balance_value').notNull(),
    sourceType: varchar('source_type', { length: 30 }).notNull(), // grn | stock_doc
    sourceId: uuid('source_id').notNull(),
    projectId: uuid('project_id'),
    boqItemId: uuid('boq_item_id'),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [
    index('sm_item_wh_idx').on(t.itemId, t.warehouseId, t.date),
    index('sm_source_idx').on(t.sourceType, t.sourceId),
    index('sm_project_idx').on(t.projectId),
  ],
);

/** Issue to project / transfer / adjustment / opening stock document. */
export const stockDocuments = pgTable('stock_documents', {
  id: id(),
  no: varchar('no', { length: 30 }).notNull().unique(),
  type: varchar('type', { length: 20 }).notNull(), // issue | transfer | adjustment | opening
  date: date('date').notNull(),
  fromWarehouseId: uuid('from_warehouse_id').references(() => warehouses.id),
  toWarehouseId: uuid('to_warehouse_id').references(() => warehouses.id),
  projectId: uuid('project_id'),
  siteRequisitionId: uuid('site_requisition_id'),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | posted | cancelled
  remarks: text('remarks'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by'),
  ...timestamps(),
});

export const stockDocumentLines = pgTable('stock_document_lines', {
  id: id(),
  documentId: uuid('document_id').notNull().references(() => stockDocuments.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  /** For adjustments: signed. For issue/transfer: positive. For opening: positive with unitCost. */
  quantity: qty('quantity').notNull(),
  unitCost: rate('unit_cost'),
  boqItemId: uuid('boq_item_id'),
  remarks: text('remarks'),
});

// ---------------- Procurement ----------------

export const purchaseRequisitions = pgTable('purchase_requisitions', {
  id: id(),
  no: varchar('no', { length: 30 }).notNull().unique(),
  date: date('date').notNull(),
  requiredBy: date('required_by'),
  projectId: uuid('project_id'),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  siteRequisitionId: uuid('site_requisition_id'),
  requestedBy: uuid('requested_by'),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | submitted | approved | ordered | rejected
  remarks: text('remarks'),
  ...timestamps(),
});

export const purchaseRequisitionLines = pgTable('purchase_requisition_lines', {
  id: id(),
  requisitionId: uuid('requisition_id').notNull().references(() => purchaseRequisitions.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  quantity: qty('quantity').notNull(),
  estimatedRate: money('estimated_rate'),
  remarks: text('remarks'),
});

export const supplierQuotations = pgTable('supplier_quotations', {
  id: id(),
  requisitionId: uuid('requisition_id').references(() => purchaseRequisitions.id),
  partyId: uuid('party_id').notNull().references(() => parties.id),
  quoteRef: varchar('quote_ref', { length: 100 }),
  date: date('date').notNull(),
  validUntil: date('valid_until'),
  status: varchar('status', { length: 20 }).notNull().default('received'), // received | selected | rejected
  ...timestamps(),
});

export const supplierQuotationLines = pgTable('supplier_quotation_lines', {
  id: id(),
  quotationId: uuid('quotation_id').notNull().references(() => supplierQuotations.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id),
  quantity: qty('quantity').notNull(),
  unitPrice: money('unit_price').notNull(),
  deliveryDays: integer('delivery_days'),
});

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    no: varchar('no', { length: 30 }).notNull().unique(),
    partyId: uuid('party_id').notNull().references(() => parties.id),
    date: date('date').notNull(),
    expectedDate: date('expected_date'),
    projectId: uuid('project_id'),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    requisitionId: uuid('requisition_id').references(() => purchaseRequisitions.id),
    quotationId: uuid('quotation_id').references(() => supplierQuotations.id),
    subtotal: money('subtotal').notNull().default('0'),
    vatAmount: money('vat_amount').notNull().default('0'),
    total: money('total').notNull().default('0'),
    /** draft | approved | partially_received | received | closed | cancelled */
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    terms: text('terms'),
    approvedBy: uuid('approved_by'),
    createdBy: uuid('created_by'),
    ...timestamps(),
  },
  (t) => [index('po_party_idx').on(t.partyId), index('po_project_idx').on(t.projectId)],
);

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  lineNo: integer('line_no').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  description: text('description'),
  quantity: qty('quantity').notNull(),
  receivedQty: qty('received_qty').notNull().default('0'),
  billedQty: qty('billed_qty').notNull().default('0'),
  unitPrice: money('unit_price').notNull(),
  vatCodeId: uuid('vat_code_id').references(() => taxCodes.id),
  vatAmount: money('vat_amount').notNull().default('0'),
  amount: money('amount').notNull(),
});

export const goodsReceipts = pgTable('goods_receipts', {
  id: id(),
  no: varchar('no', { length: 30 }).notNull().unique(),
  orderId: uuid('order_id').notNull().references(() => purchaseOrders.id),
  partyId: uuid('party_id').notNull().references(() => parties.id),
  date: date('date').notNull(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  challanNo: varchar('challan_no', { length: 50 }),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | posted | cancelled
  remarks: text('remarks'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by'),
  ...timestamps(),
});

export const goodsReceiptLines = pgTable('goods_receipt_lines', {
  id: id(),
  receiptId: uuid('receipt_id').notNull().references(() => goodsReceipts.id, { onDelete: 'cascade' }),
  orderLineId: uuid('order_line_id').notNull().references(() => purchaseOrderLines.id),
  itemId: uuid('item_id').notNull().references(() => items.id),
  quantity: qty('quantity').notNull(),
  unitCost: money('unit_cost').notNull(),
  amount: money('amount').notNull(),
});
