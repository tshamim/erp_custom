'use client';

import { useState } from 'react';
import { DataTable } from '@/components/resource';
import { Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Stat } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date, money, today } from '@/lib/format';
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
            { key: 'lastReconciledDate', label: 'Last reconciled', format: 'date' },
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
  const [v, setV] = useState({ accountCode: '1122', bankName: '', branchName: '', accountNo: '', routingNo: '', openingBalance: '0', openingDate: today() });
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
        <Field label="Existing balance" hint="The balance the bank shows today; posted against Opening Balance Equity">
          <Input value={v.openingBalance} onChange={set('openingBalance')} />
        </Field>
        <Field label="As on">
          <Input type="date" value={v.openingDate} onChange={set('openingDate')} />
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

/** Where the account stands, and closing the period once the statement agrees. */
function ReconcileSummary({ bankId }: { bankId: string }) {
  const q = useGet<Row>(`/bank-accounts/${bankId}/summary`);
  const [close, setClose] = useState({ statementDate: today(), statementBalance: '', notes: '' });
  const save = useAction(() => post(`/bank-accounts/${bankId}/reconciliation/close`, { ...close, notes: close.notes || null }), 'Reconciliation recorded');
  if (q.isLoading || !q.data) return <Loading />;
  const s = q.data;
  const diff = close.statementBalance === '' ? null : Number(close.statementBalance) - Number(s.expectedStatementBalance);
  return (
    <Card title="Where this account stands">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Opening balance" value={money(s.openingBalance)} sub={s.openingDate ? date(s.openingDate) : 'Not set'} />
        <Stat label="Book balance" value={money(s.bookBalance)} />
        <Stat label="Not yet on a statement" value={money(s.unreconciledLedgerAmount)} sub={`${s.openLedgerItems} ledger entries`} />
        <Stat label="Expected statement balance" value={money(s.expectedStatementBalance)} sub="Book less items in transit" />
      </div>
      {s.lastReconciled ? (
        <p className="mt-3 text-sm text-slate-500">
          Last reconciled {(s.lastReconciled as Row).date} at {money((s.lastReconciled as Row).statementBalance)} · difference {money((s.lastReconciled as Row).difference)}
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-500">This account has never been reconciled.</p>
      )}
      {can('finance.payment.update') && (
        <div className="mt-3 grid grid-cols-4 items-end gap-2 border-t border-slate-200 pt-3">
          <Field label="Statement date">
            <Input type="date" value={close.statementDate} onChange={(e) => setClose({ ...close, statementDate: e.target.value })} />
          </Field>
          <Field label="Closing balance on the statement">
            <Input value={close.statementBalance} onChange={(e) => setClose({ ...close, statementBalance: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Note">
            <Input value={close.notes} onChange={(e) => setClose({ ...close, notes: e.target.value })} />
          </Field>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={close.statementBalance === ''}>
            Record reconciliation
          </Button>
          {diff !== null && (
            <p className={`col-span-4 text-sm ${diff === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {diff === 0 ? 'Agrees with the books — nothing unexplained.' : `Unexplained difference of ${money(String(diff))}. Match the remaining items below, or record it with a note.`}
            </p>
          )}
        </div>
      )}
    </Card>
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
          <ReconcileSummary bankId={bank.id as string} />
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
