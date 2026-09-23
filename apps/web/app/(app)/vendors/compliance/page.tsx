'use client';

import Link from 'next/link';
import { DataTable } from '@/components/resource';
import { Badge, DocState, ErrorBox, Loading, PageHeader, Stat } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import type { Row } from '@/lib/resource-types';

export default function CompliancePage() {
  const q = useGet<Row[]>('/vendors/compliance');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  return (
    <div>
      <PageHeader title="Vendor compliance" subtitle="Trade licences, VAT and tax certificates that have expired or expire within 30 days." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Expired" value={rows.filter((r) => r.state === 'expired').length} tone="bad" />
        <Stat label="Expiring in 30 days" value={rows.filter((r) => r.state === 'expiring').length} />
      </div>
      <DataTable
        rows={rows}
        empty="All vendor documents are valid"
        rowHref={(r) => `/vendors/${r.partyId}`}
        columns={[
          { key: 'partyName', label: 'Vendor', render: (r) => <Link className="text-brand-600 hover:underline" href={`/vendors/${r.partyId}`}>{r.partyName}</Link> },
          { key: 'vendorStatus', label: 'Vendor status', format: 'status' },
          { key: 'docType', label: 'Document' },
          { key: 'docNo', label: 'Number' },
          { key: 'expiryDate', label: 'Expires', format: 'date' },
          { key: 'daysLeft', label: 'Days left', render: (r) => <span className={Number(r.daysLeft) < 0 ? 'font-medium text-red-600' : 'text-amber-700'}>{r.daysLeft}</span> },
          { key: 'state', label: 'State', render: (r) => <DocState state={r.state} /> },
        ]}
      />
    </div>
  );
}
