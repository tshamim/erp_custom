'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet, useLookups } from '@/lib/hooks';
import { fiscalYearStart, money, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

/**
 * Profit sharing for one project: what the ledger says the project earned over a period,
 * each investor's agreed share, and one click to book what is still outstanding.
 */
export default function EntitlementsPage() {
  const lookups = useLookups(['projects']);
  const projects = (lookups.data?.projects ?? []) as Row[];
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState(fiscalYearStart());
  const [to, setTo] = useState(today());
  const params = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const q = useGet<Row>(projectId ? `/investors/projects/${projectId}/entitlements?${params}` : null);
  const book = useAction(
    (agreementId: string) => post('/investors/allocate-profit', { agreementId, date: to || today(), periodFrom: from, periodTo: to }),
    'Profit share booked',
  );

  return (
    <div>
      <PageHeader
        title="Profit sharing"
        subtitle="Profit comes straight from the project's ledger — revenue less its costs. Booking a share credits the investor and charges the company's profit share account."
        actions={
          <Link href="/investors" className="self-center text-sm text-slate-500 hover:text-slate-700">
            ← Investors
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Project" className="sm:col-span-2">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id as string} value={p.id as string}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period from">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Period to">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      {!projectId && <p className="text-sm text-slate-500">Pick a project to see who shares its profit.</p>}
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Project profit for the period" value={money(q.data.projectProfit)} tone={Number(q.data.projectProfit) < 0 ? 'bad' : 'good'} />
            <Stat label="Shared with investors" value={`${q.data.totalSharePercent}%`} />
            <Stat label="Company's share" value={money(q.data.companyShare)} />
            <Stat label="Investors on this project" value={(q.data.investors as Row[]).length} />
          </div>

          <Card className="mt-4" title="Entitlement by investor">
            <DataTable
              rows={q.data.investors as Row[]}
              columns={[
                { key: 'agreementNo', label: 'Agreement' },
                {
                  key: 'investorName',
                  label: 'Investor',
                  render: (r) => (
                    <Link className="text-brand-600 hover:underline" href={`/investors/${r.investorId}`}>
                      {r.investorName}
                    </Link>
                  ),
                },
                { key: 'committedAmount', label: 'Committed', format: 'money' },
                { key: 'contributed', label: 'Contributed', format: 'money' },
                { key: 'profitSharePercent', label: 'Share %', format: 'qty' },
                { key: 'sharesLoss', label: 'Carries loss', format: 'bool' },
                { key: 'entitlement', label: 'Entitlement', format: 'money' },
                { key: 'booked', label: 'Already booked', format: 'money' },
                { key: 'toBook', label: 'Still to book', format: 'money' },
                { key: 'status', label: 'Status', format: 'status' },
              ]}
              actions={(r) =>
                can('investor.transaction.post') && Number(r.toBook) !== 0 ? (
                  <Button size="sm" variant="secondary" loading={book.isPending} onClick={() => book.mutate(r.agreementId as string)}>
                    Book {money(r.toBook)}
                  </Button>
                ) : null
              }
              empty="No investor is tied to this project yet."
            />
          </Card>
          <p className="mt-2 text-xs text-slate-500">
            Booking records the share as payable to the investor; pay it out from Money in &amp; out. Running it again for the same period only books the difference.
          </p>
        </>
      )}
    </div>
  );
}
