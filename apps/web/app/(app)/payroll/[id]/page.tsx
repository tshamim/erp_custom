'use client';

import { Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Stat } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet, useLookups } from '@/lib/hooks';
import { money, qty, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>();
  const q = useGet<Row>(`/payroll-runs/${id}`);
  const [slip, setSlip] = useState<Row | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const finalize = useAction(() => post(`/payroll-runs/${id}/finalize`), 'Payroll finalized and posted');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const r = q.data!;
  const slips = r.payslips as Row[];
  const sumOf = (k: string) => slips.reduce((a, s) => a + Number(s[k]), 0);
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            Payroll {r.month} <Badge value={r.status} />
          </span>
        }
        subtitle={`${r.no} · ${r.workingDays} working days${r.includeFestivalBonus ? ' · with festival bonus' : ''}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print sheet
            </Button>
            {r.status === 'draft' && can('payroll.run.finalize') && (
              <Button onClick={() => confirm('Finalize payroll? It will be posted to the ledger and locked.') && finalize.mutate()} loading={finalize.isPending}>
                Finalize &amp; post
              </Button>
            )}
            {r.status === 'finalized' && can('payroll.run.finalize') && <Button onClick={() => setPayOpen(true)}>Disburse salaries</Button>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Employees" value={slips.length} />
        <Stat label="Gross" value={money(r.totalGross)} />
        <Stat label="PF (employee)" value={money(sumOf('pfEmployee'))} />
        <Stat label="TDS" value={money(sumOf('tds'))} />
        <Stat label="Net pay" value={money(r.totalNet)} />
      </div>
      <DataTable
        rows={slips}
        onRowClick={setSlip}
        columns={[
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'projectName', label: 'Project' },
          { key: 'presentDays', label: 'Days', format: 'qty' },
          { key: 'gross', label: 'Gross', format: 'money' },
          { key: 'overtimeAmount', label: 'OT', format: 'money' },
          { key: 'absentDeduction', label: 'Absence', format: 'money' },
          { key: 'pfEmployee', label: 'PF', format: 'money' },
          { key: 'tds', label: 'TDS', format: 'money' },
          { key: 'netPay', label: 'Net', format: 'money' },
        ]}
      />
      {slip && <Payslip slip={slip} run={r} onClose={() => setSlip(null)} />}
      <PayModal open={payOpen} onClose={() => setPayOpen(false)} id={id} amount={r.totalNet} />
    </div>
  );
}

function Payslip({ slip, run, onClose }: { slip: Row; run: Row; onClose: () => void }) {
  const earnings = [
    ['Basic', slip.basic],
    ['House rent', slip.houseRent],
    ['Medical', slip.medical],
    ['Conveyance', slip.conveyance],
    ['Other allowance', slip.otherAllowance],
    [`Overtime (${qty(slip.overtimeHours)} h)`, slip.overtimeAmount],
    ['Festival bonus', slip.festivalBonus],
  ];
  const deductions = [
    [`Absence (${qty(slip.absentDays)} d)`, slip.absentDeduction],
    ['Provident fund', slip.pfEmployee],
    ['Income tax (TDS)', slip.tds],
    ['Other', slip.otherDeduction],
  ];
  return (
    <Modal open onClose={onClose} title={`Payslip · ${run.month}`} wide>
      <div className="mb-3 text-sm">
        <div className="font-semibold">
          {slip.name} ({slip.code})
        </div>
        <div className="text-slate-500">
          {slip.designation ?? ''} · Present {qty(slip.presentDays)} days {slip.bankAccountNo ? `· A/C ${slip.bankAccountNo}` : ''}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 text-sm">
        {[
          ['Earnings', earnings, slip.gross],
          ['Deductions', deductions, Number(slip.absentDeduction) + Number(slip.pfEmployee) + Number(slip.tds) + Number(slip.otherDeduction)],
        ].map(([title, list, total]) => (
          <div key={title as string}>
            <div className="mb-1 font-semibold">{title as string}</div>
            {(list as [string, string][])
              .filter(([, v]) => Number(v))
              .map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="num">{money(v)}</span>
                </div>
              ))}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span className="num">{money(total)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between rounded bg-slate-50 p-3 text-base font-semibold">
        <span>Net pay</span>
        <span className="num">BDT {money(slip.netPay)}</span>
      </div>
    </Modal>
  );
}

function PayModal({ open, onClose, id, amount }: { open: boolean; onClose: () => void; id: string; amount: string }) {
  const lookups = useLookups(['accounts']);
  const [account, setAccount] = useState('');
  const [date, setDate] = useState(today());
  const pay = useAction(() => post(`/payroll-runs/${id}/pay`, { cashAccountId: account, date }), 'Salary disbursement posted', onClose);
  return (
    <Modal open={open} onClose={onClose} title="Disburse salaries">
      <p className="mb-3 text-sm">
        Posts Dr Salary payable / Cr bank for <b className="num">BDT {money(amount)}</b>.
      </p>
      <div className="space-y-3">
        <Field label="Pay from">
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">— Select —</option>
            {lookups.data?.accounts
              ?.filter((a) => ['cash', 'bank'].includes(String(a.subtype)))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button onClick={() => pay.mutate()} disabled={!account} loading={pay.isPending}>
            Post disbursement
          </Button>
        </div>
      </div>
    </Modal>
  );
}
