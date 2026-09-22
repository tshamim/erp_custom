'use client';

import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Field, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { qs } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import type { Row } from '@/lib/resource-types';

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<Row | null>(null);
  const q = useGet<{ data: Row[] }>(`/audit-logs${qs({ entity, page, pageSize: 50 })}`);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every create, update, post, approve and login — with before/after values." />
      <Field label="Entity" className="mb-3 w-64">
        <Input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="e.g. invoice, employee, user" />
      </Field>
      {q.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={q.data?.data ?? []}
          onRowClick={setView}
          columns={[
            { key: 'at', label: 'When', format: 'datetime' },
            { key: 'userName', label: 'User' },
            { key: 'action', label: 'Action', format: 'status' },
            { key: 'entity', label: 'Entity' },
            { key: 'entityId', label: 'Record', render: (r) => <span className="font-mono text-xs">{r.entityId?.slice(0, 8) ?? '—'}</span> },
            { key: 'ip', label: 'IP' },
          ]}
        />
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Newer
        </Button>
        <Button size="sm" variant="secondary" disabled={(q.data?.data.length ?? 0) < 50} onClick={() => setPage(page + 1)}>
          Older
        </Button>
      </div>
      {view && (
        <Modal open onClose={() => setView(null)} title={`${view.action} · ${view.entity}`} wide>
          <div className="grid gap-3 md:grid-cols-2">
            {(['before', 'after'] as const).map((k) => (
              <div key={k}>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{k}</div>
                <pre className="max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(view[k], null, 2) ?? 'null'}</pre>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
