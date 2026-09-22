'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input, Select } from './ui';
import { can, post } from '@/lib/api';
import { useAction, useLookups } from '@/lib/hooks';
import { money, qty, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

/** Receive goods against an approved PO (creates + posts a GRN). */
export function GoodsReceiptPanel({ order }: { order: Row }) {
  const router = useRouter();
  const pending = (order.lines as Row[]).filter((l) => Number(l.pendingQty) > 0);
  const [date, setDate] = useState(today());
  const [challanNo, setChallanNo] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>(Object.fromEntries(pending.map((l) => [l.id, String(Number(l.pendingQty))])));
  const receive = useAction(
    () =>
      post<Row>('/goods-receipts', {
        orderId: order.id,
        date,
        challanNo: challanNo || null,
        lines: Object.entries(qtys)
          .filter(([, v]) => Number(v) > 0)
          .map(([orderLineId, quantity]) => ({ orderLineId, quantity })),
      }),
    'Goods received and posted to stock',
    (res) => router.push(`/m/goods-receipts/${res.id}`),
  );
  if (!['approved', 'partially_received'].includes(order.status) || !pending.length || !can('procurement.receipt.create')) {
    return order.receipts?.length ? <ReceiptList receipts={order.receipts} /> : null;
  }
  return (
    <div className="space-y-4">
      <Card title="Receive goods (GRN)">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Field label="Receipt date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Supplier challan no.">
            <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
          </Field>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pb-2">Item</th>
              <th className="pb-2 text-right">Pending</th>
              <th className="w-40 pb-2 text-right">Receive now</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((l) => (
              <tr key={l.id}>
                <td className="py-1">
                  {l.itemCode} — {l.itemName}
                </td>
                <td className="num py-1 text-right">
                  {qty(l.pendingQty)} {l.uom}
                </td>
                <td className="py-1">
                  <Input className="text-right" value={qtys[l.id] ?? ''} onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => receive.mutate()} loading={receive.isPending}>
            Post goods receipt
          </Button>
        </div>
      </Card>
      {order.receipts?.length ? <ReceiptList receipts={order.receipts} /> : null}
    </div>
  );
}

function ReceiptList({ receipts }: { receipts: Row[] }) {
  return (
    <Card title="Receipts">
      <ul className="text-sm">
        {receipts.map((r) => (
          <li key={r.id}>
            <a className="text-brand-600 hover:underline" href={`/m/goods-receipts/${r.id}`}>
              {r.no}
            </a>{' '}
            · {r.date}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Measure subcontractor work against the work order → posts AP bill with retention. */
export function SubcontractBillPanel({ workOrder }: { workOrder: Row }) {
  const [date, setDate] = useState(today());
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const lines = workOrder.lines as Row[];
  const bill = useAction(
    () =>
      post('/work-orders/bills', {
        workOrderId: workOrder.id,
        date,
        lines: Object.entries(qtys)
          .filter(([, v]) => Number(v) > 0)
          .map(([workOrderLineId, currentQty]) => ({ workOrderLineId, currentQty })),
      }),
    'Subcontract bill posted to accounts payable',
    () => setQtys({}),
  );
  const gross = lines.reduce((a, l) => a + Number(qtys[l.id] || 0) * Number(l.rate), 0);
  return (
    <div className="space-y-4">
      {workOrder.status === 'active' && can('construction.subcontract.update') && (
        <Card title="New measurement / subcontract bill">
          <Field label="Bill date" className="mb-3 w-48">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2">Work item</th>
                <th className="pb-2 text-right">Balance qty</th>
                <th className="w-40 pb-2 text-right">This bill qty</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-1">{l.description}</td>
                  <td className="num py-1 text-right">
                    {qty(Number(l.quantity) - Number(l.executedQty))} {l.uom}
                  </td>
                  <td className="py-1">
                    <Input className="text-right" value={qtys[l.id] ?? ''} onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-end gap-4 text-sm">
            <span>
              Gross <b className="num">{money(gross)}</b> · Retention {workOrder.retentionPercent}% · Net{' '}
              <b className="num">{money(gross * (1 - Number(workOrder.retentionPercent) / 100))}</b>
            </span>
            <Button onClick={() => bill.mutate()} loading={bill.isPending} disabled={gross <= 0}>
              Post bill
            </Button>
          </div>
        </Card>
      )}
      <Card title="Bills against this work order">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th>No.</th>
              <th>Date</th>
              <th className="text-right">Gross</th>
              <th className="text-right">Retention</th>
              <th className="text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {(workOrder.bills as Row[]).map((b) => (
              <tr key={b.id}>
                <td className="py-1">
                  {b.billId ? (
                    <a className="text-brand-600 hover:underline" href={`/m/bills/${b.billId}`}>
                      {b.no}
                    </a>
                  ) : (
                    b.no
                  )}
                </td>
                <td>{b.date}</td>
                <td className="num text-right">{money(b.grossAmount)}</td>
                <td className="num text-right">{money(b.retentionAmount)}</td>
                <td className="num text-right">{money(b.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/** Issue pending site-requisition quantities from a store to the project (posts stock issue). */
export function IssueFromRequisitionPanel({ requisition }: { requisition: Row }) {
  const router = useRouter();
  const lookups = useLookups(['warehouses']);
  const pending = (requisition.lines as Row[]).filter((l) => Number(l.pendingQty) > 0);
  const [warehouseId, setWarehouseId] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>(Object.fromEntries(pending.map((l) => [l.id, String(Number(l.pendingQty))])));
  const issue = useAction(
    () =>
      post<Row>('/stock/documents?post=true', {
        type: 'issue',
        date: today(),
        fromWarehouseId: warehouseId,
        projectId: requisition.projectId,
        siteRequisitionId: requisition.id,
        remarks: `Against ${requisition.no}`,
        lines: pending.filter((l) => Number(qtys[l.id]) > 0).map((l) => ({ itemId: l.itemId, quantity: qtys[l.id], boqItemId: l.boqItemId })),
      }),
    'Material issued to project',
    (res) => router.push(`/m/stock-documents/${res.id}`),
  );
  if (!pending.length || !can('inventory.movement.create')) return null;
  return (
    <Card title="Issue material from store">
      <Field label="From warehouse" className="mb-3 w-72">
        <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">— Select —</option>
          {lookups.data?.warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </Select>
      </Field>
      <table className="w-full text-sm">
        <tbody>
          {pending.map((l) => (
            <tr key={l.id}>
              <td className="py-1">
                {l.itemCode} — {l.itemName}
              </td>
              <td className="num py-1 text-right text-slate-500">
                pending {qty(l.pendingQty)} {l.uom}
              </td>
              <td className="w-40 py-1">
                <Input className="text-right" value={qtys[l.id] ?? ''} onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex justify-end">
        <Button onClick={() => issue.mutate()} loading={issue.isPending} disabled={!warehouseId}>
          Post issue
        </Button>
      </div>
    </Card>
  );
}
