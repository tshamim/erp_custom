'use client';

import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Stat } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import type { Row } from '@/lib/resource-types';

/** Papers already expired or expiring within 30 days, and one button to mail the list out. */
export default function ExpiringDocumentsPage() {
  const q = useGet<Row[]>('/company-documents/expiring');
  const [to, setTo] = useState('');
  const send = useAction(
    () =>
      post('/company-documents/expiring/email', {
        to: to
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    'Email sent',
    () => setTo(''),
  );
  const rows = q.data ?? [];
  const expired = rows.filter((r) => r.state === 'expired');

  return (
    <div>
      <PageHeader
        title="Documents needing attention"
        subtitle="Company papers already expired, or expiring within the next 30 days."
        actions={
          <Link href="/m/company-documents" className="self-center text-sm text-brand-600 hover:underline">
            All company documents →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Needing attention" value={rows.length} />
        <Stat label="Already expired" value={expired.length} tone={expired.length ? 'bad' : undefined} />
        <Stat label="Expiring within 30 days" value={rows.length - expired.length} />
      </div>

      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} />}

      <Card className="mt-4" title="The list">
        <DataTable
          rows={rows}
          columns={[
            { key: 'category', label: 'Category', format: 'status' },
            { key: 'title', label: 'Title' },
            { key: 'docNo', label: 'Document No.' },
            { key: 'issuedBy', label: 'Issued by' },
            { key: 'expiryDate', label: 'Expires', format: 'date' },
            { key: 'daysLeft', label: 'Days left', render: (r) => (Number(r.daysLeft) < 0 ? `${Math.abs(Number(r.daysLeft))} overdue` : r.daysLeft) },
            { key: 'state', label: 'Validity', format: 'status' },
            { key: 'projectName', label: 'Project' },
          ]}
          empty="Nothing expires in the next 30 days."
        />
      </Card>

      {can('document.document.update') && rows.length > 0 && (
        <Card className="mt-4" title="Send this list by email">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Recipients" hint="Leave blank to send it to everyone with the Admin role. Separate several addresses with commas.">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="accounts@company.com, admin@company.com" />
            </Field>
            <Button onClick={() => send.mutate()} loading={send.isPending}>
              <Mail className="h-4 w-4" /> Email the list
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
