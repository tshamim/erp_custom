'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select } from '@/components/ui';
import { post } from '@/lib/api';
import { useAction, useGet, useLookups } from '@/lib/hooks';
import { money, qty, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function NewRaBillPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [projectId, setProjectId] = useState(params.get('projectId') ?? '');
  const [date, setDate] = useState(today());
  const [periodTo, setPeriodTo] = useState(today());
  const [remarks, setRemarks] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const lookups = useLookups(['projects']);
  const project = useGet<Row>(projectId ? `/projects/${projectId}` : null);
  const boq = useGet<Row[]>(projectId ? `/projects/${projectId}/boq` : null);

  const create = useAction(
    () =>
      post<Row>('/ra-bills', {
        projectId,
        date,
        periodTo,
        remarks: remarks || null,
        lines: Object.entries(qtys)
          .filter(([, v]) => Number(v) > 0)
          .map(([boqItemId, currentQty]) => ({ boqItemId, currentQty })),
      }),
    'RA bill drafted',
    (res) => router.push(`/m/ra-bills/${res.id}`),
  );

  const items = (boq.data ?? []).filter((b) => !b.isSection);
  const gross = items.reduce((a, b) => a + Number(qtys[b.id] || 0) * Number(b.rate), 0);
  const p = project.data;
  const retention = p ? (gross * Number(p.retentionPercent)) / 100 : 0;
  const vat = p ? (gross * Number(p.vatPercent)) / 100 : 0;
  const advance = p ? (gross * Number(p.advanceRecoveryPercent)) / 100 : 0;

  return (
    <div>
      <PageHeader title="New running account (RA) bill" subtitle="Measure work done this period against the BOQ." />
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Project *" className="md:col-span-2">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Select —</option>
              {lookups.data?.projects?.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.code} — {pr.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bill date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Work up to">
            <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </Field>
          <Field label="Remarks" className="md:col-span-4">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      </Card>
      {projectId && (boq.isLoading ? <Loading /> : (
        <Card title="Measurement" className="mt-4">
          {!items.length ? (
            <p className="text-sm text-slate-500">This project has no BOQ items. Add them on the project&apos;s BOQ tab first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2 text-right">BOQ qty</th>
                    <th className="pb-2 text-right">Previous</th>
                    <th className="pb-2 text-right">Balance</th>
                    <th className="w-32 pb-2 text-right">This bill</th>
                    <th className="pb-2 text-right">Rate</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((b) => {
                    const balance = Number(b.quantity) - Number(b.executedQty);
                    const over = Number(qtys[b.id] || 0) > balance;
                    return (
                      <tr key={b.id}>
                        <td className="py-1.5">{b.code}</td>
                        <td className="max-w-xs truncate" title={b.description}>
                          {b.description}
                        </td>
                        <td className="num text-right">
                          {qty(b.quantity)} {b.uom}
                        </td>
                        <td className="num text-right">{qty(b.executedQty)}</td>
                        <td className="num text-right">{qty(balance)}</td>
                        <td>
                          <Input className={`text-right ${over ? 'border-red-400' : ''}`} value={qtys[b.id] ?? ''} onChange={(e) => setQtys({ ...qtys, [b.id]: e.target.value })} />
                        </td>
                        <td className="num text-right">{money(b.rate)}</td>
                        <td className="num text-right">{money(Number(qtys[b.id] || 0) * Number(b.rate))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 ml-auto w-full max-w-sm space-y-1 text-sm">
            <Row label="Gross value of work" value={gross} bold />
            <Row label={`Less retention (${p?.retentionPercent ?? 0}%)`} value={-retention} />
            <Row label={`Less advance recovery (${p?.advanceRecoveryPercent ?? 0}%, capped)`} value={-advance} />
            <Row label={`Add VAT (${p?.vatPercent ?? 0}%)`} value={vat} />
            <Row label="Net receivable (estimate)" value={gross - retention - advance + vat} bold />
          </div>
          <div className="mt-4 space-y-2">
            <ErrorBox error={create.error} />
            <div className="flex justify-end">
              <Button onClick={() => create.mutate()} loading={create.isPending} disabled={gross <= 0}>
                Create draft RA bill
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t pt-1 font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="num">{money(value)}</span>
    </div>
  );
}
