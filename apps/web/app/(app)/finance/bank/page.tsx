'use client';

import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, Field, Input, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { money, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function BankPage() {
  const q = useGet<Row[]>('/bank-accounts');
  const [open, setOpen] = useState(false);
  const [recon, setRecon] = useState<Row | null>(null);
  return (
    <div>
      <PageHeader title="Bank accounts" subtitle="Each bank account has its own ledger account. Click one to reconcile against the bank statement." actions={can('finance.account.create') && <Button onClick={() => setOpen(true)}>Add bank account</Button>} />
      {q.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={q.data ?? []}
          onRowClick={setRecon}
          columns={[
            { key: 'accountCode', label: 'GL code' },
            { key: 'bankName', label: 'Bank' },
            { key: 'branchName', label: 'Branch' },
            { key: 'accountNo', label: 'Account no.' },
            { key: 'routingNo', label: 'Routing' },
            { key: 'balance', label: 'Book balance', format: 'money' },
          ]}
          empty="No bank accounts yet. The default ‘Bank - Main Operating’ ledger (1121) can still be used for payments."
        />
      )}
      {open && <NewBank onClose={() => setOpen(false)} />}
      {recon && <Reconcile bank={recon} onClose={() => setRecon(null)} />}
    </div>
  );
}

function NewBank({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({ accountCode: '1122', bankName: '', branchName: '', accountNo: '', routingNo: '' });
  const save = useAction(() => post('/bank-accounts', v), 'Bank account created', onClose);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="New bank account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="GL account code" hint="Created under 1120 Bank Accounts">
          <Input value={v.accountCode} onChange={set('accountCode')} required />
        </Field>
        <Field label="Bank">
          <Input value={v.bankName} onChange={set('bankName')} required placeholder="e.g. Dutch-Bangla Bank" />
        </Field>
        <Field label="Branch">
          <Input value={v.branchName} onChange={set('branchName')} />
        </Field>
        <Field label="Account no.">
          <Input value={v.accountNo} onChange={set('accountNo')} required />
        </Field>
        <Field label="Routing no.">
          <Input value={v.routingNo} onChange={set('routingNo')} />
        </Field>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Reconcile({ bank, onClose }: { bank: Row; onClose: () => void }) {
  const q = useGet<Row>(`/bank-accounts/${bank.id}/reconciliation`);
  const [line, setLine] = useState({ date: today(), description: '', amount: '' });
  const [pick, setPick] = useState<Record<string, string>>({});
  const add = useAction(() => post(`/bank-accounts/${bank.id}/statement-lines`, { lines: [{ ...line, description: line.description || null }] }), 'Statement line added', () => setLine({ date: today(), description: '', amount: '' }));
  const match = useAction(({ s, j }: { s: string; j: string }) => post(`/bank-accounts/statement-lines/${s}/match`, { journalLineId: j }), 'Matched');
  return (
    <Modal open onClose={onClose} title={`Reconcile · ${bank.bankName} ${bank.accountNo}`} wide>
      {q.isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <Card title="Add bank statement line">
            <div className="grid grid-cols-4 items-end gap-2">
              <Input type="date" value={line.date} onChange={(e) => setLine({ ...line, date: e.target.value })} />
              <Input placeholder="Description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} />
              <Input placeholder="Amount (+in / −out)" value={line.amount} onChange={(e) => setLine({ ...line, amount: e.target.value })} />
              <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!line.amount}>
                Add
              </Button>
            </div>
          </Card>
          <Card title="Unreconciled statement lines">
            {(q.data!.unreconciledStatement as Row[]).length === 0 && <p className="text-sm text-slate-400">All statement lines reconciled.</p>}
            {(q.data!.unreconciledStatement as Row[]).map((s) => {
              const candidates = (q.data!.unmatchedLedger as Row[]).filter((l) => Number(l.amount) === Number(s.amount));
              return (
                <div key={s.id} className="mb-2 flex items-center gap-2 text-sm">
                  <span className="w-24">{s.date}</span>
                  <span className="flex-1 truncate">{s.description}</span>
                  <span className="num w-28 text-right">{money(s.amount)}</span>
                  <Select className="w-64 py-1" value={pick[s.id] ?? ''} onChange={(e) => setPick({ ...pick, [s.id]: e.target.value })}>
                    <option value="">{candidates.length ? 'Match ledger entry…' : 'No matching amount'}</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.date} {c.no} {c.reference ?? ''}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" disabled={!pick[s.id]} onClick={() => match.mutate({ s: s.id, j: pick[s.id] })}>
                    Match
                  </Button>
                </div>
              );
            })}
          </Card>
          <Card title="Ledger entries not yet on a statement">
            <DataTable
              rows={q.data!.unmatchedLedger}
              columns={[
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'no', label: 'Entry' },
                { key: 'reference', label: 'Reference' },
                { key: 'narration', label: 'Narration' },
                { key: 'amount', label: 'Amount', format: 'money' },
              ]}
            />
          </Card>
        </div>
      )}
    </Modal>
  );
}
