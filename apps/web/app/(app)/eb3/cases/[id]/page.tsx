'use client';

import { Check, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Attachments } from '@/components/file-tools';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Stat, Tabs, Textarea } from '@/components/ui';
import { can, del, patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date, money, titleCase, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const TABS = [
  { key: 'stages', label: 'Stages & timeline' },
  { key: 'documents', label: 'Document checklist' },
  { key: 'money', label: 'Fees' },
  { key: 'candidate', label: 'Candidate' },
];

/** Fields that belong to a particular stage, so the officer is asked only for what that stage produces. */
const STAGE_FIELDS: Record<string, { name: string; label: string; type?: string }[]> = {
  perm_filed: [{ name: 'permCaseNo', label: 'PERM case No.' }],
  i140_filed: [{ name: 'i140Receipt', label: 'I-140 receipt No.' }],
  nvc_processing: [{ name: 'nvcCaseNo', label: 'NVC case No.' }],
  interview_scheduled: [
    { name: 'interviewDate', label: 'Interview date', type: 'date' },
    { name: 'consulate', label: 'Consulate' },
  ],
  visa_approved: [{ name: 'visaNumber', label: 'Visa number' }],
  departed: [{ name: 'departureDate', label: 'Departure date', type: 'date' }],
};

export default function Eb3CasePage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('stages');
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const q = useGet<Row>(`/eb3/cases/${id}`);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const c = q.data!;
  const cand = c.candidate as Row;
  const m = c.money as Row;
  const stages = c.stages as string[];
  const reached = c.stageIndex as number;
  const closed = ['closed', 'withdrawn'].includes(c.status as string);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {cand.fullName} <Badge value={c.stage as string} /> <Badge value={c.status as string} /> <span className="text-sm font-normal text-slate-500">{c.no}</span>
          </span>
        }
        subtitle={[c.employerName, c.jobTitle, cand.passportNo && `Passport ${cand.passportNo}`, c.priorityDate && `Priority date ${date(c.priorityDate)}`].filter(Boolean).join(' · ')}
        actions={
          <Link href="/eb3" className="self-center text-sm text-slate-500 hover:text-slate-700">
            ← Case board
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Agreed fee" value={money(c.agreedFee)} />
        <Stat label="Collected" value={money(m.collected)} />
        <Stat label="Due from candidate" value={money(m.due)} tone={Number(m.due) > 0 ? 'bad' : 'good'} />
        <Stat label="Spent on their behalf" value={money(m.spentOnBehalf)} />
      </div>

      <div className="mt-4">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {tab === 'stages' && (
        <div className="space-y-4">
          <Card title="Statutory stages">
            <ol className="space-y-1">
              {stages.map((s, i) => {
                const done = i <= reached;
                return (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={done ? 'font-medium text-slate-800' : 'text-slate-500'}>{titleCase(s)}</span>
                    {i === reached && <span className="text-xs text-slate-500">since {date(c.stageDate)}</span>}
                    {can('eb3.case.advance') && !closed && i > reached && (
                      <Button size="sm" variant="secondary" onClick={() => setAdvancing(s)}>
                        Record
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm lg:grid-cols-4">
              <Detail label="PERM case No." value={c.permCaseNo} />
              <Detail label="I-140 receipt" value={c.i140Receipt} />
              <Detail label="NVC case No." value={c.nvcCaseNo} />
              <Detail label="Consulate" value={c.consulate} />
              <Detail label="Interview" value={c.interviewDate ? date(c.interviewDate) : null} />
              <Detail label="Visa number" value={c.visaNumber} />
              <Detail label="Departure" value={c.departureDate ? date(c.departureDate) : null} />
              <Detail label="Attorney" value={c.attorneyName} />
            </div>
          </Card>

          <Card title="Timeline">
            <DataTable
              rows={c.events as Row[]}
              columns={[
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'title', label: 'Event', render: (r) => titleCase(r.title as string) },
                { key: 'stage', label: 'Stage', format: 'status' },
                { key: 'notes', label: 'Notes' },
              ]}
              empty="Nothing recorded yet."
            />
          </Card>
        </div>
      )}

      {tab === 'documents' && (
        <Card
          title="Document checklist"
          actions={
            can('eb3.case.update') && (
              <Button size="sm" variant="secondary" onClick={() => setDocOpen(true)}>
                <Plus className="h-4 w-4" /> Add item
              </Button>
            )
          }
        >
          <Checklist caseId={id} rows={c.documents as Row[]} />
          <div className="mt-4">
            <Attachments entity="eb3_case" entityId={id} title="Scans & photographs" />
          </div>
          {docOpen && <NewChecklistItem caseId={id} onClose={() => setDocOpen(false)} />}
        </Card>
      )}

      {tab === 'money' && (
        <Card title="Fees on this case" actions={<Link className="text-sm text-brand-600 hover:underline" href="/m/eb3-payments/new">Record a fee →</Link>}>
          <DataTable
            rows={c.payments as Row[]}
            columns={[
              { key: 'no', label: 'No.' },
              { key: 'date', label: 'Date', format: 'date' },
              { key: 'type', label: 'Type', format: 'status' },
              { key: 'direction', label: 'In / out', format: 'status' },
              { key: 'amount', label: 'Amount', format: 'money' },
              { key: 'method', label: 'Method', format: 'status' },
              { key: 'reference', label: 'Reference' },
              { key: 'status', label: 'Status', format: 'status' },
            ]}
            empty="No fee has been recorded against this case."
          />
        </Card>
      )}

      {tab === 'candidate' && (
        <Card title="Candidate details" actions={<Link className="text-sm text-brand-600 hover:underline" href={`/m/eb3-candidates/${cand.id}`}>Edit →</Link>}>
          <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
            <Detail label="Code" value={cand.code} />
            <Detail label="Phone" value={cand.phone} />
            <Detail label="Email" value={cand.email} />
            <Detail label="District" value={cand.district} />
            <Detail label="Date of birth" value={cand.dateOfBirth ? date(cand.dateOfBirth) : null} />
            <Detail label="Passport" value={cand.passportNo} />
            <Detail label="Passport expiry" value={cand.passportExpiry ? date(cand.passportExpiry) : null} />
            <Detail label="Dependents" value={String(cand.dependents ?? 0)} />
            <Detail label="Education" value={cand.education} />
            <Detail label="Experience" value={cand.experienceYears ? `${cand.experienceYears} years` : null} />
            <Detail label="Skill" value={cand.skill} />
            <Detail label="English" value={cand.englishLevel ? titleCase(cand.englishLevel as string) : null} />
          </div>
        </Card>
      )}

      {advancing && <AdvanceStage caseId={id} stage={advancing} onClose={() => setAdvancing(null)} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-slate-800">{value || '—'}</p>
    </div>
  );
}

function AdvanceStage({ caseId, stage, onClose }: { caseId: string; stage: string; onClose: () => void }) {
  const fields = STAGE_FIELDS[stage] ?? [];
  const [v, setV] = useState<Row>({ date: today(), notes: '' });
  const save = useAction(() => post(`/eb3/cases/${caseId}/advance`, { stage, ...v, notes: v.notes || null }), `${titleCase(stage)} recorded`, onClose);
  return (
    <Modal open onClose={onClose} title={`Record — ${titleCase(stage)}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="Date">
          <Input type="date" value={v.date as string} onChange={(e) => setV({ ...v, date: e.target.value })} required />
        </Field>
        {fields.map((f) => (
          <Field key={f.name} label={f.label}>
            <Input type={f.type ?? 'text'} value={(v[f.name] as string) ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          </Field>
        ))}
        <Field label="Notes" className="col-span-2">
          <Textarea rows={2} value={v.notes as string} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Record
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Checklist({ caseId, rows }: { caseId: string; rows: Row[] }) {
  const receive = useAction(({ id, received }: { id: string; received: string | null }) => patch(`/eb3/case-documents/${id}`, { receivedDate: received }), 'Checklist updated');
  const remove = useAction((id: string) => del(`/eb3/case-documents/${id}`), 'Removed');
  const editable = can('eb3.case.update');
  return (
    <DataTable
      rows={rows}
      columns={[
        { key: 'docType', label: 'Document' },
        { key: 'required', label: 'Required', format: 'bool' },
        { key: 'receivedDate', label: 'Received', format: 'date' },
        { key: 'expiryDate', label: 'Expires', format: 'date' },
        { key: 'remarks', label: 'Remarks' },
      ]}
      actions={
        editable
          ? (r) => (
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => receive.mutate({ id: r.id as string, received: r.receivedDate ? null : today() })}>
                  {r.receivedDate ? 'Mark missing' : 'Mark received'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id as string)}>
                  Remove
                </Button>
              </span>
            )
          : undefined
      }
      empty={`No checklist for case ${caseId}.`}
    />
  );
}

function NewChecklistItem({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [v, setV] = useState({ docType: '', required: true, receivedDate: '', expiryDate: '', remarks: '' });
  const save = useAction(
    () =>
      post('/eb3/case-documents', {
        caseId,
        docType: v.docType,
        required: v.required,
        receivedDate: v.receivedDate || null,
        expiryDate: v.expiryDate || null,
        remarks: v.remarks || null,
      }),
    'Checklist item added',
    onClose,
  );
  return (
    <Modal open onClose={onClose} title="Add a checklist item">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="Document" className="col-span-2">
          <Input value={v.docType} onChange={(e) => setV({ ...v, docType: e.target.value })} required placeholder="e.g. Skill certificate" />
        </Field>
        <Field label="Received on">
          <Input type="date" value={v.receivedDate} onChange={(e) => setV({ ...v, receivedDate: e.target.value })} />
        </Field>
        <Field label="Expires on">
          <Input type="date" value={v.expiryDate} onChange={(e) => setV({ ...v, expiryDate: e.target.value })} />
        </Field>
        <Field label="Remarks" className="col-span-2">
          <Input value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={v.required} onChange={(e) => setV({ ...v, required: e.target.checked })} /> Required for this case
        </label>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" loading={save.isPending} disabled={!v.docType}>
            Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}
