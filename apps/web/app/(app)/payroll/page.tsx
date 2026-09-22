'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, Field, Input, Loading, PageHeader } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function PayrollRunsPage() {
  const router = useRouter();
  const q = useGet<Row[]>('/payroll-runs');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [bonus, setBonus] = useState(false);
  const [workingDays, setWorkingDays] = useState('');
  const gen = useAction(
    () => post<Row>('/payroll-runs', { month, includeFestivalBonus: bonus, workingDays: workingDays ? Number(workingDays) : undefined }),
    'Payroll generated',
    (r) => router.push(`/payroll/${r.id}`),
  );
  return (
    <div>
      <PageHeader title="Payroll runs" subtitle="Generated from salary structures and attendance; finalizing posts salary, PF and TDS to the ledger." />
      {can('payroll.run.create') && (
        <Card title="Generate / regenerate payroll" className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Month">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
            <Field label="Working days" hint="Blank = company default">
              <Input type="number" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} className="w-28" />
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={bonus} onChange={(e) => setBonus(e.target.checked)} /> Include festival bonus (Eid)
            </label>
            <Button onClick={() => gen.mutate()} loading={gen.isPending}>
              Generate
            </Button>
          </div>
        </Card>
      )}
      {q.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={q.data ?? []}
          rowHref={(r) => `/payroll/${r.id}`}
          columns={[
            { key: 'no', label: 'No.' },
            { key: 'month', label: 'Month' },
            { key: 'workingDays', label: 'Working days' },
            { key: 'totalGross', label: 'Gross', format: 'money' },
            { key: 'totalDeductions', label: 'Deductions', format: 'money' },
            { key: 'totalNet', label: 'Net pay', format: 'money' },
            { key: 'status', label: 'Status', format: 'status' },
          ]}
        />
      )}
    </div>
  );
}
