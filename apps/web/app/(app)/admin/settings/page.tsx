'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, Loading, PageHeader } from '@/components/ui';
import { put } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import type { Row } from '@/lib/resource-types';

interface Slab {
  upTo: number | null;
  rate: number;
}

export default function SettingsPage() {
  const q = useGet<Row>('/settings');
  const [v, setV] = useState<Row | null>(null);
  useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);
  const save = useAction(() => put('/settings', v), 'Settings saved');
  if (q.isLoading || !v) return <Loading />;
  const slabs = (v['payroll.tax_slabs'] as Slab[]) ?? [];
  const set = (k: string, val: unknown) => setV({ ...v, [k]: val });
  const weekend = ((v['hr.weekend_days'] as number[]) ?? [5]).map(String);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div>
      <PageHeader title="Company settings" actions={<Button onClick={() => save.mutate()} loading={save.isPending}>Save settings</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Company">
          <div className="space-y-3">
            <Field label="Company name">
              <Input value={String(v['company.name'] ?? '')} onChange={(e) => set('company.name', e.target.value)} />
            </Field>
            <Field label="Base currency">
              <Input value={String(v['company.currency'] ?? 'BDT')} disabled />
            </Field>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">Weekly holidays</span>
              <div className="flex gap-3">
                {days.map((d, i) => (
                  <label key={d} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={weekend.includes(String(i))}
                      onChange={(e) => set('hr.weekend_days', e.target.checked ? [...weekend.map(Number), i] : weekend.map(Number).filter((x) => x !== i))}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <Card title="Payroll">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Working days / month">
              <Input type="number" value={Number(v['payroll.working_days_per_month'] ?? 26)} onChange={(e) => set('payroll.working_days_per_month', Number(e.target.value))} />
            </Field>
            <Field label="Festival bonus (% of basic)">
              <Input type="number" value={Number(v['payroll.festival_bonus_percent_of_basic'] ?? 100)} onChange={(e) => set('payroll.festival_bonus_percent_of_basic', Number(e.target.value))} />
            </Field>
            <Field label="Tax-free cap (BDT)" hint="Exemption = lower of 1/3 income or this">
              <Input type="number" value={Number(v['payroll.tax_exemption_cap'] ?? 450000)} onChange={(e) => set('payroll.tax_exemption_cap', Number(e.target.value))} />
            </Field>
            <Field label="Minimum tax (BDT)">
              <Input type="number" value={Number(v['payroll.minimum_tax'] ?? 5000)} onChange={(e) => set('payroll.minimum_tax', Number(e.target.value))} />
            </Field>
          </div>
        </Card>
        <Card title="Individual income-tax slabs (annual taxable income)" className="lg:col-span-2">
          <p className="mb-3 text-xs text-amber-700">Defaults are a starting point. Update them to match the current Finance Act before running payroll.</p>
          <table className="w-full max-w-lg text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Up to (cumulative, BDT)</th>
                <th className="pb-2">Rate %</th>
              </tr>
            </thead>
            <tbody>
              {slabs.map((s, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <Input
                      value={s.upTo ?? ''}
                      placeholder="Remaining"
                      onChange={(e) => set('payroll.tax_slabs', slabs.map((x, j) => (j === i ? { ...x, upTo: e.target.value === '' ? null : Number(e.target.value) } : x)))}
                    />
                  </td>
                  <td className="py-1">
                    <Input type="number" value={s.rate} onChange={(e) => set('payroll.tax_slabs', slabs.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
