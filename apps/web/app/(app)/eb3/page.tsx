'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Stat } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet, useList } from '@/lib/hooks';
import { money, titleCase, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

/** Live EB-3 cases: how many sit at each statutory stage, and the case list behind them. */
export default function Eb3BoardPage() {
  const [stage, setStage] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('active');
  const pipeline = useGet<Row[]>('/eb3/pipeline');
  const cases = useList<Row>('/eb3/cases', { pageSize: 200, ...(stage ? { stage } : {}), ...(status ? { status } : {}) });
  const rows = (cases.data && 'data' in cases.data ? cases.data.data : (cases.data as Row[] | undefined)) ?? [];
  const live = (pipeline.data ?? []).reduce((a, p) => a + Number(p.count), 0);
  const fee = (pipeline.data ?? []).reduce((a, p) => a + Number(p.agreedFee), 0);

  return (
    <div>
      <PageHeader
        title="EB-3 case board"
        subtitle="Each case is one candidate against one job order, tracked through the statutory stages. Dates and documents only — no legal advice."
        actions={
          <>
            <div className="flex flex-wrap gap-4 self-center text-sm">
              <Link href="/m/eb3-candidates" className="text-brand-600 hover:underline">
                Candidates →
              </Link>
              <Link href="/m/eb3-job-orders" className="text-brand-600 hover:underline">
                Job orders →
              </Link>
              <Link href="/m/eb3-payments" className="text-brand-600 hover:underline">
                Fees →
              </Link>
            </div>
            {can('eb3.case.create') && <Button onClick={() => setOpen(true)}>Open a case</Button>}
          </>
        }
      />
      {open && <NewCase onClose={() => setOpen(false)} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live cases" value={live} />
        <Stat label="Agreed fees on live cases" value={money(String(fee))} />
        <Stat label="Stages tracked" value={(pipeline.data ?? []).length} />
        <Stat label="Showing" value={rows.length} sub={stage ? titleCase(stage) : 'All stages'} />
      </div>

      <Card className="mt-4" title="Pipeline">
        {pipeline.isLoading ? (
          <Loading />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(pipeline.data ?? []).map((p) => (
              <button
                key={p.stage as string}
                onClick={() => setStage(stage === p.stage ? '' : (p.stage as string))}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  stage === p.stage ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="block text-xs uppercase tracking-wide text-slate-500">{titleCase(p.stage as string)}</span>
                <span className="text-lg font-semibold">{p.count as number}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4" title="Cases">
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {['active', 'on_hold', 'closed', 'withdrawn', 'denied'].map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage">
            <Select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">All stages</option>
              {(pipeline.data ?? []).map((p) => (
                <option key={p.stage as string} value={p.stage as string}>
                  {titleCase(p.stage as string)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {cases.isLoading ? (
          <Loading />
        ) : cases.error ? (
          <ErrorBox error={cases.error} />
        ) : (
          <DataTable
            rows={rows}
            rowHref={(r) => `/eb3/cases/${r.id}`}
            columns={[
              { key: 'no', label: 'Case' },
              { key: 'candidateName', label: 'Candidate' },
              { key: 'passportNo', label: 'Passport' },
              { key: 'employerName', label: 'Employer' },
              { key: 'jobTitle', label: 'Position' },
              { key: 'stage', label: 'Stage', format: 'status' },
              { key: 'stageDate', label: 'Since', format: 'date' },
              { key: 'priorityDate', label: 'Priority date', format: 'date' },
              { key: 'interviewDate', label: 'Interview', format: 'date' },
              { key: 'docsPending', label: 'Docs pending' },
              { key: 'agreedFee', label: 'Agreed fee', format: 'money' },
              { key: 'collected', label: 'Collected', format: 'money' },
              { key: 'due', label: 'Due', format: 'money' },
              { key: 'status', label: 'Status', format: 'status' },
            ]}
            empty="No cases yet. Open one from a candidate and a job order."
          />
        )}
      </Card>
    </div>
  );
}

/** Opening a case ties a candidate to a job order and starts the checklist and timeline. */
function NewCase({ onClose }: { onClose: () => void }) {
  const candidates = useList<Row>('/eb3/candidates', { pageSize: 200 });
  const employers = useList<Row>('/eb3/employers', { pageSize: 200 });
  const jobs = useList<Row>('/eb3/job-orders', { pageSize: 200, status: 'open' });
  const [v, setV] = useState({ candidateId: '', employerId: '', jobOrderId: '', openedDate: today(), agreedFee: '0', attorneyName: '', notes: '' });
  const save = useAction(
    () => post('/eb3/cases', { ...v, jobOrderId: v.jobOrderId || null, attorneyName: v.attorneyName || null, notes: v.notes || null }),
    'Case opened',
    onClose,
  );
  const rows = (q: typeof candidates) => (q.data && 'data' in q.data ? (q.data.data as Row[]) : ((q.data as Row[] | undefined) ?? []));
  const openJobs = rows(jobs).filter((j) => !v.employerId || j.employerId === v.employerId);

  return (
    <Modal open onClose={onClose} title="Open an EB-3 case">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="Candidate" className="col-span-2">
          <Select value={v.candidateId} onChange={(e) => setV({ ...v, candidateId: e.target.value })} required>
            <option value="">Select a candidate…</option>
            {rows(candidates).map((c) => (
              <option key={c.id as string} value={c.id as string}>
                {c.code} — {c.fullName} {c.passportNo ? `· ${c.passportNo}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Employer">
          <Select value={v.employerId} onChange={(e) => setV({ ...v, employerId: e.target.value, jobOrderId: '' })} required>
            <option value="">Select…</option>
            {rows(employers).map((emp) => (
              <option key={emp.id as string} value={emp.id as string}>
                {emp.code} — {emp.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job order" hint="Only open orders with a vacancy can be used">
          <Select value={v.jobOrderId} onChange={(e) => setV({ ...v, jobOrderId: e.target.value })}>
            <option value="">—</option>
            {openJobs.map((j) => (
              <option key={j.id as string} value={j.id as string}>
                {j.no} — {j.title} ({j.vacancies} vacant)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Opened on">
          <Input type="date" value={v.openedDate} onChange={(e) => setV({ ...v, openedDate: e.target.value })} required />
        </Field>
        <Field label="Agreed service fee">
          <Input value={v.agreedFee} onChange={(e) => setV({ ...v, agreedFee: e.target.value })} />
        </Field>
        <Field label="Attorney" className="col-span-2">
          <Input value={v.attorneyName} onChange={(e) => setV({ ...v, attorneyName: e.target.value })} />
        </Field>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" loading={save.isPending} disabled={!v.candidateId || !v.employerId}>
            Open case
          </Button>
        </div>
      </form>
    </Modal>
  );
}
