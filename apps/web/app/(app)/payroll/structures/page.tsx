'use client';

import { useState } from 'react';
import { DataTable, useOptions } from '@/components/resource';
import { Button, Field, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { money, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const EMPTY = { employeeId: '', effectiveFrom: today(), basic: '', houseRent: '', medical: '', conveyance: '', otherAllowance: '0', pfPercent: '0', overtimeRatePerHour: '0', taxEnabled: true };

export default function SalaryStructuresPage() {
  const q = useGet<Row[]>('/salary-structures');
  const [edit, setEdit] = useState<Row | null>(null);
  return (
    <div>
      <PageHeader
        title="Salary structures"
        subtitle="Bangladesh breakup: basic, house rent, medical, conveyance. Tip: house rent ≈ 50% of basic."
        actions={can('payroll.structure.create') && <Button onClick={() => setEdit({ ...EMPTY })}>Add / update structure</Button>}
      />
      {q.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={q.data ?? []}
          onRowClick={(r) => setEdit({ ...r, taxEnabled: r.taxEnabled })}
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Employee' },
            { key: 'basic', label: 'Basic', format: 'money' },
            { key: 'houseRent', label: 'House rent', format: 'money' },
            { key: 'medical', label: 'Medical', format: 'money' },
            { key: 'conveyance', label: 'Conveyance', format: 'money' },
            { key: 'gross', label: 'Gross', format: 'money' },
            { key: 'pfPercent', label: 'PF %', format: 'qty' },
            { key: 'taxEnabled', label: 'TDS', format: 'bool' },
          ]}
        />
      )}
      {edit && <StructureModal initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function StructureModal({ initial, onClose }: { initial: Row; onClose: () => void }) {
  const emps = useOptions({ endpoint: '/employees/pick', label: (r) => `${r.code} — ${r.name}`, filter: (r) => r.employmentType !== 'daily_wage' });
  const [v, setV] = useState<Row>(initial);
  const save = useAction(
    () =>
      post('/salary-structures', {
        employeeId: v.employeeId,
        effectiveFrom: v.effectiveFrom,
        basic: v.basic,
        houseRent: v.houseRent || '0',
        medical: v.medical || '0',
        conveyance: v.conveyance || '0',
        otherAllowance: v.otherAllowance || '0',
        pfPercent: v.pfPercent || '0',
        overtimeRatePerHour: v.overtimeRatePerHour || '0',
        taxEnabled: !!v.taxEnabled,
      }),
    'Salary structure saved',
    onClose,
  );
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const gross = ['basic', 'houseRent', 'medical', 'conveyance', 'otherAllowance'].reduce((a, k) => a + Number(v[k] || 0), 0);
  return (
    <Modal open onClose={onClose} title="Salary structure">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="Employee *" className="col-span-2">
          <Select value={v.employeeId} onChange={set('employeeId')} required>
            <option value="">—</option>
            {emps.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Effective from">
          <Input type="date" value={v.effectiveFrom} onChange={set('effectiveFrom')} />
        </Field>
        <Field label="Basic *">
          <Input value={v.basic} onChange={set('basic')} required />
        </Field>
        <Field label="House rent">
          <Input value={v.houseRent} onChange={set('houseRent')} />
        </Field>
        <Field label="Medical">
          <Input value={v.medical} onChange={set('medical')} />
        </Field>
        <Field label="Conveyance">
          <Input value={v.conveyance} onChange={set('conveyance')} />
        </Field>
        <Field label="Other allowance">
          <Input value={v.otherAllowance} onChange={set('otherAllowance')} />
        </Field>
        <Field label="PF % of basic">
          <Input value={v.pfPercent} onChange={set('pfPercent')} />
        </Field>
        <Field label="OT rate / hour" hint="0 = 2 × basic / 208">
          <Input value={v.overtimeRatePerHour} onChange={set('overtimeRatePerHour')} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v.taxEnabled} onChange={(e) => setV({ ...v, taxEnabled: e.target.checked })} /> Deduct income tax (TDS) monthly
        </label>
        <div className="col-span-2 flex items-center justify-between">
          <span className="text-sm">
            Gross: <b className="num">{money(gross)}</b>
          </span>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
