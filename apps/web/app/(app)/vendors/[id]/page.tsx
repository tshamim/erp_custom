'use client';

import { Ban, CheckCircle2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Attachments, ExportMenu } from '@/components/file-tools';
import { Badge, Button, Card, DocState, ErrorBox, Field, Input, LinkButton, Loading, Modal, PageHeader, Select, Stat, Tabs, Textarea } from '@/components/ui';
import { can, del, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date, money, qty, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Compliance & files' },
  { key: 'evaluations', label: 'Ratings' },
  { key: 'orders', label: 'Orders & receipts' },
  { key: 'money', label: 'Bills & payments' },
  { key: 'prices', label: 'Price history' },
];

const STATUS_LABEL: Record<string, string> = { approved: 'Approved', pending: 'Pending approval', on_hold: 'On hold', blacklisted: 'Blacklisted' };

export default function VendorPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const [statusOpen, setStatusOpen] = useState(false);
  const q = useGet<Row>(`/vendors/${id}`);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const v = q.data!;
  const p = v.party as Row;
  const k = v.kpis as Row;
  const r = v.rating as Row | null;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.name} <Badge value={p.vendorStatus} /> <span className="text-sm font-normal text-slate-500">{p.code}</span>
          </span>
        }
        subtitle={[p.vendorCategory, p.type === 'subcontractor' ? 'Subcontractor' : 'Vendor', p.phone, p.binNo && `BIN ${p.binNo}`, p.tin && `TIN ${p.tin}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Link href="/vendors" className="self-center text-sm text-slate-500 hover:text-slate-700">
              ← All vendors
            </Link>
            <LinkButton href={`/m/parties/${id}`} variant="secondary">
              <Pencil className="h-4 w-4" /> Edit profile
            </LinkButton>
            {can('vendor.vendor.approve') && (
              <Button variant={p.vendorStatus === 'approved' ? 'secondary' : 'primary'} onClick={() => setStatusOpen(true)}>
                {p.vendorStatus === 'approved' ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} Change status
              </Button>
            )}
          </>
        }
      />
      {p.vendorStatus !== 'approved' && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {STATUS_LABEL[p.vendorStatus]} — new purchase orders and work orders are blocked. {p.blacklistReason ? `Reason: ${p.blacklistReason}` : ''}
        </div>
      )}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Purchase orders" value={money(k.poValue)} sub={`${k.poCount} orders`} />
            <Stat label="Billed" value={money(k.billed)} />
            <Stat label="Paid" value={money(k.paid)} sub={`TDS ${money(k.tdsDeducted)} · VDS ${money(k.vdsDeducted)}`} />
            <Stat label="Outstanding" value={money(k.outstanding)} tone={Number(k.outstanding) > 0 ? 'bad' : undefined} />
            <Stat label="Retention held" value={money(k.retentionHeld)} />
            <Stat label="On-time delivery" value={k.onTimeDeliveryPct === null ? '—' : `${k.onTimeDeliveryPct}%`} sub={`${k.deliveries} deliveries`} />
            <Stat label="Avg lead time" value={k.avgLeadTimeDays === null ? '—' : `${k.avgLeadTimeDays} days`} />
            <Stat label="Rating" value={r ? `${r.overall} / 5` : '—'} sub={r ? `${r.count} evaluations` : 'No evaluations yet'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Contact & banking">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Contact person', p.contactPerson],
                  ['Phone', p.phone],
                  ['Email', p.email],
                  ['Address', p.address],
                  ['Trade licence', p.tradeLicense],
                  ['Payment terms', `${p.paymentTermsDays} days`],
                  ['Bank', [p.bankName, p.bankBranch].filter(Boolean).join(' — ')],
                  ['Bank account', p.bankAccountNo],
                  ['Routing no.', p.routingNo],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-slate-500">{label as string}</dt>
                    <dd className="font-medium text-slate-800">{(value as string) || '—'}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Work orders (subcontract)">
              <DataTable
                rows={v.workOrders as Row[]}
                empty="No work orders"
                rowHref={(x) => `/m/work-orders/${x.id}`}
                columns={[
                  { key: 'no', label: 'No.' },
                  { key: 'projectName', label: 'Project' },
                  { key: 'value', label: 'Value', format: 'money' },
                  { key: 'status', label: 'Status', format: 'status' },
                ]}
              />
            </Card>
          </div>
        </div>
      )}

      {tab === 'documents' && <DocumentsTab vendorId={id} documents={v.documents as Row[]} />}
      {tab === 'evaluations' && <EvaluationsTab vendorId={id} evaluations={v.evaluations as Row[]} rating={r} />}

      {tab === 'orders' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Purchase orders">
            <DataTable
              rows={v.orders as Row[]}
              rowHref={(x) => `/m/purchase-orders/${x.id}`}
              columns={[
                { key: 'no', label: 'No.' },
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'total', label: 'Total', format: 'money' },
                { key: 'status', label: 'Status', format: 'status' },
              ]}
            />
          </Card>
          <Card title="Goods receipts">
            <DataTable
              rows={v.receipts as Row[]}
              rowHref={(x) => `/m/goods-receipts/${x.id}`}
              columns={[
                { key: 'no', label: 'GRN' },
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'challanNo', label: 'Challan' },
                { key: 'status', label: 'Status', format: 'status' },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'money' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Bills">
            <DataTable
              rows={v.bills as Row[]}
              rowHref={(x) => `/m/bills/${x.id}`}
              columns={[
                { key: 'no', label: 'No.' },
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'total', label: 'Payable', format: 'money' },
                { key: 'paidAmount', label: 'Paid', format: 'money' },
                { key: 'status', label: 'Status', format: 'status' },
              ]}
            />
          </Card>
          <Card title="Payments">
            <DataTable
              rows={v.payments as Row[]}
              rowHref={(x) => `/m/payments/${x.id}`}
              columns={[
                { key: 'no', label: 'No.' },
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'amount', label: 'Gross', format: 'money' },
                { key: 'tdsAmount', label: 'TDS', format: 'money' },
                { key: 'method', label: 'Method', format: 'status' },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'prices' && (
        <Card
          title="Purchase price history"
          actions={
            <ExportMenu
              title={`${p.name} price history`}
              columns={priceColumns}
              load={() => v.priceHistory as Row[]}
            />
          }
        >
          <DataTable rows={v.priceHistory as Row[]} columns={priceColumns} empty="No purchases yet" />
        </Card>
      )}

      {statusOpen && <StatusModal vendorId={id} current={p.vendorStatus} onClose={() => setStatusOpen(false)} />}
    </div>
  );
}

const priceColumns = [
  { key: 'date', label: 'Date', format: 'date' as const },
  { key: 'poNo', label: 'PO' },
  { key: 'itemCode', label: 'Code' },
  { key: 'itemName', label: 'Item' },
  { key: 'quantity', label: 'Qty', format: 'qty' as const },
  { key: 'unitPrice', label: 'Unit price', format: 'money' as const },
];

function StatusModal({ vendorId, current, onClose }: { vendorId: string; current: string; onClose: () => void }) {
  const [status, setStatus] = useState(current === 'approved' ? 'on_hold' : 'approved');
  const [reason, setReason] = useState('');
  const save = useAction(() => post(`/vendors/${vendorId}/status`, { status, reason: reason || null }), 'Vendor status updated', onClose);
  return (
    <Modal open onClose={onClose} title="Change vendor status">
      <div className="space-y-3">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" hint={status === 'blacklisted' ? 'Required when blacklisting' : 'Optional'}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Only approved vendors can receive purchase orders and work orders.</p>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={status === 'blacklisted' && !reason}>
            Save status
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DocumentsTab({ vendorId, documents }: { vendorId: string; documents: Row[] }) {
  const [v, setV] = useState({ docType: 'Trade Licence', docNo: '', issueDate: '', expiryDate: '', remarks: '' });
  const add = useAction(
    () => post('/vendor-documents', { partyId: vendorId, ...v, docNo: v.docNo || null, issueDate: v.issueDate || null, expiryDate: v.expiryDate || null, remarks: v.remarks || null }),
    'Document recorded',
    () => setV({ ...v, docNo: '', issueDate: '', expiryDate: '', remarks: '' }),
  );
  const remove = useAction((id: string) => del(`/vendor-documents/${id}`), 'Document removed');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="space-y-4">
      {can('vendor.vendor.update') && (
        <Card title="Record a compliance document">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="grid grid-cols-2 items-end gap-3 md:grid-cols-6"
          >
            <Field label="Type">
              <Select value={v.docType} onChange={set('docType')}>
                {['Trade Licence', 'VAT (BIN) Certificate', 'TIN Certificate', 'Bank Solvency', 'Enlistment', 'Insurance', 'Other'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
            <Field label="Number">
              <Input value={v.docNo} onChange={set('docNo')} />
            </Field>
            <Field label="Issued">
              <Input type="date" value={v.issueDate} onChange={set('issueDate')} />
            </Field>
            <Field label="Expires">
              <Input type="date" value={v.expiryDate} onChange={set('expiryDate')} />
            </Field>
            <Field label="Remarks">
              <Input value={v.remarks} onChange={set('remarks')} />
            </Field>
            <Button type="submit" loading={add.isPending}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </Card>
      )}
      <Card title="Documents on file">
        <DataTable
          rows={documents}
          empty="No compliance documents recorded"
          columns={[
            { key: 'docType', label: 'Type' },
            { key: 'docNo', label: 'Number' },
            { key: 'issueDate', label: 'Issued', format: 'date' },
            { key: 'expiryDate', label: 'Expires', format: 'date' },
            { key: 'state', label: 'State', render: (r) => <DocState state={r.state} /> },
            { key: 'remarks', label: 'Remarks' },
          ]}
          actions={(r) =>
            can('vendor.vendor.update') ? (
              <button className="text-slate-400 hover:text-red-600" onClick={() => confirm('Remove this document?') && remove.mutate(r.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null
          }
        />
        <p className="mt-2 text-xs text-slate-500">Attach the scanned copies below — they are stored against this vendor.</p>
      </Card>
      <Attachments entity="party" entityId={vendorId} title="Scanned copies & correspondence" />
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(n) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
      ))}
    </span>
  );
}

function EvaluationsTab({ vendorId, evaluations, rating }: { vendorId: string; evaluations: Row[]; rating: Row | null }) {
  const [v, setV] = useState({ date: today(), quality: 4, delivery: 4, price: 3, service: 4, remarks: '' });
  const add = useAction(() => post('/vendor-evaluations', { partyId: vendorId, ...v, remarks: v.remarks || null }), 'Evaluation saved', () => setV({ ...v, remarks: '' }));
  const remove = useAction((id: string) => del(`/vendor-evaluations/${id}`), 'Evaluation removed');
  const criteria = ['quality', 'delivery', 'price', 'service'] as const;
  return (
    <div className="space-y-4">
      {rating && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Overall" value={<span className="flex items-center gap-2">{rating.overall} <Stars n={Number(rating.overall)} /></span>} sub={`${rating.count} evaluations`} />
          {criteria.map((c) => (
            <Stat key={c} label={c[0].toUpperCase() + c.slice(1)} value={Number(rating[c]).toFixed(2)} />
          ))}
        </div>
      )}
      {can('vendor.evaluation.create') && (
        <Card title="New evaluation (1 = poor, 5 = excellent)">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="grid grid-cols-2 items-end gap-3 md:grid-cols-7"
          >
            <Field label="Date">
              <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            {criteria.map((c) => (
              <Field key={c} label={c[0].toUpperCase() + c.slice(1)}>
                <Select value={v[c]} onChange={(e) => setV({ ...v, [c]: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label="Remarks">
              <Input value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} />
            </Field>
            <Button type="submit" loading={add.isPending}>
              Save
            </Button>
          </form>
        </Card>
      )}
      <DataTable
        rows={evaluations}
        empty="No evaluations yet"
        columns={[
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'quality', label: 'Quality' },
          { key: 'delivery', label: 'Delivery' },
          { key: 'price', label: 'Price' },
          { key: 'service', label: 'Service' },
          { key: 'avg', label: 'Average', render: (r) => <span className="flex items-center gap-2">{qty((Number(r.quality) + Number(r.delivery) + Number(r.price) + Number(r.service)) / 4)} <Stars n={(Number(r.quality) + Number(r.delivery) + Number(r.price) + Number(r.service)) / 4} /></span> },
          { key: 'evaluatedByName', label: 'By' },
          { key: 'remarks', label: 'Remarks' },
          { key: 'createdAt', label: 'Recorded', render: (r) => date(r.createdAt) },
        ]}
        actions={(r) =>
          can('vendor.evaluation.delete') ? (
            <button className="text-slate-400 hover:text-red-600" onClick={() => confirm('Remove this evaluation?') && remove.mutate(r.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null
        }
      />
    </div>
  );
}
