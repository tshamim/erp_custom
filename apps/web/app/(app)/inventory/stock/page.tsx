'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { DataTable } from '@/components/resource';
import { ExportMenu, ImportDialog } from '@/components/file-tools';
import { Button, Field, Input, Loading, Modal, PageHeader, Select, Stat } from '@/components/ui';
import { can, qs } from '@/lib/api';
import { useGet, useLookups } from '@/lib/hooks';
import { money } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const STOCK_COLUMNS = [
  { key: 'itemCode', label: 'Code' },
  { key: 'itemName', label: 'Item' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'uom', label: 'Unit' },
  { key: 'quantity', label: 'On hand', format: 'qty' as const },
  { key: 'avgCost', label: 'Avg cost', format: 'money' as const },
  { key: 'value', label: 'Value', format: 'money' as const },
  { key: 'reorderLevel', label: 'Reorder at', format: 'qty' as const },
];

export default function StockPage() {
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Row | null>(null);
  const lookups = useLookups(['warehouses']);
  const q = useGet<Row[]>(`/stock/balances${qs({ warehouseId, search })}`);
  const total = (q.data ?? []).reduce((a, r) => a + Number(r.value), 0);
  return (
    <div>
      <PageHeader
        title="Stock on hand"
        subtitle="Weighted-average cost per warehouse / site store. Click a row for its ledger."
        actions={
          <>
            <ExportMenu title="Stock on hand" columns={STOCK_COLUMNS} load={() => q.data ?? []} />
            {can('inventory.movement.create') && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import opening stock
              </Button>
            )}
          </>
        }
      />
      <ImportDialog resource="opening-stock" open={importOpen} onClose={() => setImportOpen(false)} />
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Warehouse">
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">All warehouses</option>
            {lookups.data?.warehouses?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item code or name" />
        </Field>
        <div className="md:col-span-2">
          <Stat label="Total stock value" value={money(total)} />
        </div>
      </div>
      {q.isLoading ? <Loading /> : <DataTable rows={q.data ?? []} onRowClick={setLedgerFor} columns={STOCK_COLUMNS} />}
      {ledgerFor && <Ledger row={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </div>
  );
}

function Ledger({ row, onClose }: { row: Row; onClose: () => void }) {
  const q = useGet<Row[]>(`/stock/ledger${qs({ itemId: row.itemId, warehouseId: row.warehouseId })}`);
  return (
    <Modal open onClose={onClose} title={`Stock ledger · ${row.itemCode} @ ${row.warehouse}`} wide>
      {q.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={q.data ?? []}
          columns={[
            { key: 'date', label: 'Date', format: 'date' },
            { key: 'type', label: 'Type', format: 'status' },
            { key: 'projectName', label: 'Project' },
            { key: 'quantity', label: 'Qty', format: 'qty' },
            { key: 'unitCost', label: 'Unit cost', format: 'money' },
            { key: 'value', label: 'Value', format: 'money' },
            { key: 'balanceQty', label: 'Bal. qty', format: 'qty' },
            { key: 'balanceValue', label: 'Bal. value', format: 'money' },
          ]}
        />
      )}
    </Modal>
  );
}
