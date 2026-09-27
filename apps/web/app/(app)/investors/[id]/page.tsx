'use client';

import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DataTable } from '@/components/resource';
import { Attachments, ExportMenu } from '@/components/file-tools';
import { Badge, Card, ErrorBox, LinkButton, Loading, PageHeader, Stat } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { money } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const STATEMENT_COLUMNS = [
  { key: 'date', label: 'Date', format: 'date' as const },
  { key: 'no', label: 'Voucher' },
  { key: 'type', label: 'Type', format: 'status' as const },
  { key: 'projectCode', label: 'Project' },
  { key: 'periodFrom', label: 'Period from', format: 'date' as const },
  { key: 'periodTo', label: 'Period to', format: 'date' as const },
  { key: 'reference', label: 'Reference' },
  { key: 'credit', label: 'Due to investor', format: 'money' as const },
  { key: 'debit', label: 'Paid / absorbed', format: 'money' as const },
  { key: 'balance', label: 'Balance', format: 'money' as const },
];

/**
 * One investor, end to end: what they committed, what they actually put in, what the
 * projects owe them today, and every movement with a running balance.
 */
export default function InvestorStatementPage() {
  const { id } = useParams<{ id: string }>();
  const q = useGet<Row>(`/investors/${id}/statement`);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const inv = s.investor as Row;
  const sum = s.summary as Row;
  const agreements = s.agreements as Row[];
  const toBook = agreements.reduce((a, r) => a + Number(r.toBook), 0);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.name} <Badge value={inv.status} /> <span className="text-sm font-normal text-slate-500">{inv.code}</span>
          </span>
        }
        subtitle={[inv.type === 'company' ? 'Company' : 'Individual', inv.contactPerson, inv.phone, inv.bankName && `${inv.bankName} ${inv.bankAccountNo ?? ''}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Link href="/investors" className="self-center text-sm text-slate-500 hover:text-slate-700">
              ← All investors
            </Link>
            <ExportMenu
              title={`Investor statement — ${inv.name}`}
              subtitle={`Balance held ${money(sum.balance)}`}
              columns={STATEMENT_COLUMNS}
              load={() => s.lines as Row[]}
            />
            <LinkButton href={`/m/investors/${id}`} variant="secondary">
              <Pencil className="h-4 w-4" /> Edit profile
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Contributed" value={money(sum.contributed)} />
        <Stat label="Profit booked" value={money(sum.profitBooked)} sub={Number(sum.lossBooked) > 0 ? `Loss booked ${money(sum.lossBooked)}` : undefined} />
        <Stat label="Paid out" value={money(sum.paidOut)} />
        <Stat label="Balance held" value={money(sum.balance)} tone={Number(sum.balance) > 0 ? 'good' : undefined} />
        <Stat label="Earned, not yet booked" value={money(String(toBook))} tone={toBook > 0 ? 'good' : toBook < 0 ? 'bad' : undefined} />
      </div>

      <Card className="mt-4" title="Agreements and live entitlement">
        <DataTable
          rows={agreements}
          columns={[
            { key: 'agreementNo', label: 'Agreement' },
            { key: 'projectCode', label: 'Project', render: (r) => `${r.projectCode} — ${r.projectName}` },
            { key: 'committedAmount', label: 'Committed', format: 'money' },
            { key: 'contributed', label: 'Contributed', format: 'money' },
            { key: 'profitSharePercent', label: 'Share %', format: 'qty' },
            { key: 'projectProfit', label: 'Project profit', format: 'money' },
            { key: 'entitlement', label: 'Entitlement', format: 'money' },
            { key: 'booked', label: 'Booked', format: 'money' },
            { key: 'toBook', label: 'Still to book', format: 'money' },
            { key: 'status', label: 'Status', format: 'status' },
          ]}
          empty="No agreements yet. Add one to tie this investor to a project's profit."
        />
      </Card>

      <Card className="mt-4" title="Account movement">
        <DataTable
          rows={s.lines as Row[]}
          columns={STATEMENT_COLUMNS}
          empty="Nothing recorded yet."
        />
      </Card>

      <div className="mt-4">
        <Attachments entity="investor" entityId={id} title="Agreements & documents" />
      </div>
    </div>
  );
}
