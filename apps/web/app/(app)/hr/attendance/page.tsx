'use client';

import { useEffect, useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, Field, Input, Loading, PageHeader, Select, Tabs } from '@/components/ui';
import { can, post, qs } from '@/lib/api';
import { useAction, useGet, useLookups } from '@/lib/hooks';
import { today, titleCase } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const STATUSES = ['present', 'late', 'half_day', 'absent', 'leave', 'holiday'];

export default function AttendancePage() {
  const [tab, setTab] = useState('daily');
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Daily marking for office staff and site workers; monthly summary feeds payroll." />
      <Tabs tabs={[{ key: 'daily', label: 'Daily sheet' }, { key: 'summary', label: 'Monthly summary' }]} active={tab} onChange={setTab} />
      {tab === 'daily' ? <Daily /> : <Summary />}
    </div>
  );
}

function Daily() {
  const [date, setDate] = useState(today());
  const [projectId, setProjectId] = useState('');
  const lookups = useLookups(['projects']);
  const q = useGet<Row[]>(`/attendance${qs({ date, projectId })}`);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => setRows((q.data ?? []).map((r) => ({ ...r, status: r.status ?? 'present', overtimeHours: r.overtimeHours ?? '0' }))), [q.data]);
  const save = useAction(
    () =>
      post('/attendance', {
        date,
        projectId: projectId || null,
        records: rows.map((r) => ({ employeeId: r.employeeId, status: r.status, checkIn: r.checkIn?.slice(0, 5) || null, checkOut: r.checkOut?.slice(0, 5) || null, overtimeHours: String(r.overtimeHours || '0'), remarks: r.remarks || null })),
      }),
    'Attendance saved',
  );
  const set = (i: number, k: string, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Site / project">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-64">
            <option value="">All staff</option>
            {lookups.data?.projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="secondary" onClick={() => setRows(rows.map((r) => ({ ...r, status: 'present' })))}>
          Mark all present
        </Button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Code</th>
                <th className="pb-2">Name</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">In</th>
                <th className="pb-2">Out</th>
                <th className="pb-2">OT hrs</th>
                <th className="pb-2">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={r.employeeId}>
                  <td className="py-1.5">{r.code}</td>
                  <td>
                    {r.name} {r.employmentType === 'daily_wage' && <span className="text-xs text-slate-400">(daily)</span>}
                  </td>
                  <td>
                    <Select value={r.status} onChange={(e) => set(i, 'status', e.target.value)} className="w-32 py-1">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Input type="time" value={r.checkIn?.slice(0, 5) ?? ''} onChange={(e) => set(i, 'checkIn', e.target.value)} className="w-28 py-1" />
                  </td>
                  <td>
                    <Input type="time" value={r.checkOut?.slice(0, 5) ?? ''} onChange={(e) => set(i, 'checkOut', e.target.value)} className="w-28 py-1" />
                  </td>
                  <td>
                    <Input value={r.overtimeHours} onChange={(e) => set(i, 'overtimeHours', e.target.value)} className="w-20 py-1 text-right" />
                  </td>
                  <td>
                    <Input value={r.remarks ?? ''} onChange={(e) => set(i, 'remarks', e.target.value)} className="py-1" />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No active employees{projectId ? ' assigned to this project' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {can('hr.attendance.create') && rows.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save attendance
          </Button>
        </div>
      )}
    </Card>
  );
}

function Summary() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const q = useGet<Row[]>(`/attendance/summary${qs({ month })}`);
  return (
    <div>
      <Field label="Month" className="mb-3 w-48">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>
      {q.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={q.data ?? []}
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'present', label: 'Present' },
            { key: 'late', label: 'Late' },
            { key: 'halfDay', label: 'Half day' },
            { key: 'absent', label: 'Absent' },
            { key: 'leave', label: 'Leave' },
            { key: 'overtimeHours', label: 'OT hours', format: 'qty' },
          ]}
        />
      )}
    </div>
  );
}
