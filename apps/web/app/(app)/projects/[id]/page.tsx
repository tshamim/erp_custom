'use client';

import { Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { BoqTab, DprTab, EquipmentTab, LinkedList, OverviewTab, TasksTab, VariationsTab } from '@/components/project-tabs';
import { DataTable } from '@/components/resource';
import { Badge, ErrorBox, LinkButton, Loading, PageHeader, Tabs } from '@/components/ui';
import { can, qs } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'boq', label: 'BOQ' },
  { key: 'tasks', label: 'Schedule (WBS)' },
  { key: 'billing', label: 'RA Bills' },
  { key: 'requisitions', label: 'Site Requisitions' },
  { key: 'subcontract', label: 'Subcontracts' },
  { key: 'materials', label: 'Material Issues' },
  { key: 'dpr', label: 'Daily Reports' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'variations', label: 'Variations' },
];

function MaterialIssues({ id }: { id: string }) {
  const q = useGet<Row[]>(`/stock/ledger${qs({ projectId: id })}`);
  if (q.isLoading) return <Loading />;
  return (
    <DataTable
      rows={q.data ?? []}
      columns={[
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'type', label: 'Type', format: 'status' },
        { key: 'itemCode', label: 'Code' },
        { key: 'itemName', label: 'Material' },
        { key: 'warehouse', label: 'Store' },
        { key: 'quantity', label: 'Qty', format: 'qty' },
        { key: 'unitCost', label: 'Unit cost', format: 'money' },
        { key: 'value', label: 'Value', format: 'money' },
      ]}
    />
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const q = useGet<Row>(`/projects/${id}`);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data!;
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {p.code} · {p.name} <Badge value={p.status} />
          </span>
        }
        subtitle={`${p.clientName ?? 'No client'} · ${p.location ?? ''} · ${date(p.startDate)} → ${date(p.endDate)} · Contract ${money(p.contractValue)}`}
        actions={
          can('construction.project.update') && (
            <LinkButton href={`/projects/${id}/edit`} variant="secondary">
              <Pencil className="h-4 w-4" /> Edit
            </LinkButton>
          )
        }
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' && <OverviewTab id={id} />}
      {tab === 'boq' && <BoqTab id={id} />}
      {tab === 'tasks' && <TasksTab id={id} />}
      {tab === 'billing' && (
        <LinkedList
          endpoint="/ra-bills"
          projectId={id}
          base="/m/ra-bills"
          newHref={can('construction.rabill.create') ? `/construction/ra-bills/new?projectId=${id}` : undefined}
          newLabel="New RA bill"
          columns={[
            { key: 'no', label: 'No.' },
            { key: 'date', label: 'Date', format: 'date' },
            { key: 'grossAmount', label: 'Gross', format: 'money' },
            { key: 'retentionAmount', label: 'Retention', format: 'money' },
            { key: 'advanceRecovery', label: 'Adv. recovery', format: 'money' },
            { key: 'vatAmount', label: 'VAT', format: 'money' },
            { key: 'netAmount', label: 'Net', format: 'money' },
            { key: 'status', label: 'Status', format: 'status' },
          ]}
        />
      )}
      {tab === 'requisitions' && (
        <LinkedList
          endpoint="/site-requisitions"
          projectId={id}
          base="/m/site-requisitions"
          newHref={can('construction.requisition.create') ? `/m/site-requisitions/new?projectId=${id}` : undefined}
          newLabel="New site requisition"
          columns={[
            { key: 'no', label: 'No.' },
            { key: 'date', label: 'Date', format: 'date' },
            { key: 'requiredBy', label: 'Required by', format: 'date' },
            { key: 'remarks', label: 'Remarks' },
            { key: 'status', label: 'Status', format: 'status' },
          ]}
        />
      )}
      {tab === 'subcontract' && (
        <LinkedList
          endpoint="/work-orders"
          projectId={id}
          base="/m/work-orders"
          newHref={can('construction.subcontract.create') ? `/m/work-orders/new?projectId=${id}` : undefined}
          newLabel="New work order"
          columns={[
            { key: 'no', label: 'No.' },
            { key: 'partyName', label: 'Subcontractor' },
            { key: 'value', label: 'Value', format: 'money' },
            { key: 'billed', label: 'Billed', format: 'money' },
            { key: 'status', label: 'Status', format: 'status' },
          ]}
        />
      )}
      {tab === 'materials' && <MaterialIssues id={id} />}
      {tab === 'dpr' && <DprTab id={id} />}
      {tab === 'equipment' && <EquipmentTab id={id} />}
      {tab === 'variations' && <VariationsTab id={id} />}
    </div>
  );
}
