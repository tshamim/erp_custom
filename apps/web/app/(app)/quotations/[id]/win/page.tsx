'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat } from '@/components/ui';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { money, qty, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

/**
 * Converting a won quotation into a live project. The contract value and BOQ come from the
 * quotation, so only the things a quotation does not carry are asked for here.
 */
export default function WinQuotationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useGet<Row>(`/quotations/${id}`);
  const managers = useGet<Row[]>('/employees/pick');
  const [v, setV] = useState({ projectCode: '', startDate: today(), endDate: '', mobilizationAdvance: '0', advanceRecoveryPercent: '0', projectManagerId: '', createSiteStore: true });

  useEffect(() => {
    if (q.data?.projectCode && !v.projectCode) setV((s) => ({ ...s, projectCode: q.data!.projectCode as string }));
  }, [q.data, v.projectCode]);

  const win = useAction(
    () =>
      post(`/quotations/${id}/win`, {
        ...v,
        endDate: v.endDate || null,
        projectManagerId: v.projectManagerId || null,
      }),
    'Project created from the quotation',
    (res) => router.push(`/projects/${(res as Row).projectId}`),
  );

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const quote = q.data!;
  const contractValue = Number(quote.subtotal) - Number(quote.discount);

  return (
    <div>
      <PageHeader
        title={`Convert ${quote.no} to a project`}
        subtitle={`${quote.title}${quote.clientName ? ` · ${quote.clientName}` : ''}`}
        actions={
          <Link href={`/m/quotations/${id}`} className="self-center text-sm text-slate-500 hover:text-slate-700">
            ← Back to quotation
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contract value" value={money(String(contractValue))} sub="Work value less discount, before VAT" />
        <Stat label="VAT on billing" value={qty(quote.vatPercent) + '%'} />
        <Stat label="Retention" value={qty(quote.retentionPercent) + '%'} />
        <Stat label="BOQ lines" value={(quote.lines as Row[]).length} />
      </div>

      <Card className="mt-4" title="Project details">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            win.mutate();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Project code" hint="Must be unique">
            <Input value={v.projectCode} onChange={(e) => setV({ ...v, projectCode: e.target.value })} required />
          </Field>
          <Field label="Start date">
            <Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
          </Field>
          <Field label="Completion date">
            <Input type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
          </Field>
          <Field label="Project manager">
            <Select value={v.projectManagerId} onChange={(e) => setV({ ...v, projectManagerId: e.target.value })}>
              <option value="">—</option>
              {(managers.data ?? []).map((emp) => (
                <option key={emp.id as string} value={emp.id as string}>
                  {emp.code} — {emp.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mobilization advance">
            <Input value={v.mobilizationAdvance} onChange={(e) => setV({ ...v, mobilizationAdvance: e.target.value })} />
          </Field>
          <Field label="Advance recovery % per bill">
            <Input value={v.advanceRecoveryPercent} onChange={(e) => setV({ ...v, advanceRecoveryPercent: e.target.value })} />
          </Field>
          <Field label="Site store">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={v.createSiteStore} onChange={(e) => setV({ ...v, createSiteStore: e.target.checked })} />
              Create a site store for this project
            </label>
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={win.isPending} disabled={!v.projectCode}>
              Create project & BOQ
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-4" title="These lines become the project BOQ">
        <DataTable
          rows={quote.lines as Row[]}
          columns={[
            { key: 'lineNo', label: 'Item' },
            { key: 'description', label: 'Description' },
            { key: 'uom', label: 'Unit' },
            { key: 'quantity', label: 'Quantity', format: 'qty' },
            { key: 'rate', label: 'Rate', format: 'money' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ]}
        />
      </Card>
    </div>
  );
}
