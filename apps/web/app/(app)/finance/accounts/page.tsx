'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, cn, Field, Input, Loading, Modal, PageHeader, Select, Tabs } from '@/components/ui';
import { can, patch, post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { money, titleCase } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function AccountsPage() {
  const [tab, setTab] = useState('coa');
  return (
    <div>
      <PageHeader title="Chart of accounts" subtitle="Bangladesh construction chart seeded on company creation. Click an account for its ledger." />
      <Tabs tabs={[{ key: 'coa', label: 'Accounts' }, { key: 'map', label: 'Posting rules' }]} active={tab} onChange={setTab} />
      {tab === 'coa' ? <Coa /> : <Mappings />}
    </div>
  );
}

function Coa() {
  const router = useRouter();
  const q = useGet<Row[]>('/accounts');
  const [edit, setEdit] = useState<Row | null>(null);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  const depth = (a: Row): number => (a.parentId ? 1 + depth(rows.find((x) => x.id === a.parentId) ?? {}) : 0);
  const balance = (a: Row) => {
    const net = Number(a.debit) - Number(a.credit);
    return ['asset', 'expense'].includes(a.type) ? net : -net;
  };
  const groupTotal = (g: Row): number => rows.filter((r) => r.parentId === g.id).reduce((s, c) => s + (c.isGroup ? groupTotal(c) : balance(c)), 0);
  return (
    <Card
      actions={
        can('finance.account.create') && (
          <Button size="sm" onClick={() => setEdit({ code: '', name: '', type: 'expense', parentId: '', isGroup: false, subtype: '' })}>
            New account
          </Button>
        )
      }
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="pb-2">Code</th>
            <th className="pb-2">Account</th>
            <th className="pb-2">Type</th>
            <th className="pb-2 text-right">Balance</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((a) => (
            <tr key={a.id} className={cn(a.isGroup ? 'bg-slate-50 font-semibold' : 'cursor-pointer hover:bg-brand-50/40')} onClick={() => !a.isGroup && router.push(`/reports?tab=gl&accountId=${a.id}`)}>
              <td className="py-1.5">{a.code}</td>
              <td style={{ paddingLeft: depth(a) * 18 }}>
                {a.name} {!a.isActive && <span className="text-xs text-slate-400">(inactive)</span>}
              </td>
              <td className="text-slate-500">{titleCase(a.type)}</td>
              <td className="num text-right">{money(a.isGroup ? groupTotal(a) : balance(a))}</td>
              <td className="text-right" onClick={(e) => e.stopPropagation()}>
                {can('finance.account.update') && (
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>
                    Edit
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <AccountModal account={edit} groups={rows.filter((r) => r.isGroup)} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function AccountModal({ account, groups, onClose }: { account: Row; groups: Row[]; onClose: () => void }) {
  const [v, setV] = useState<Row>(account);
  const save = useAction(
    () => {
      const body = { code: v.code, name: v.name, type: v.type, subtype: v.subtype || null, parentId: v.parentId || null, isGroup: !!v.isGroup, isActive: v.isActive !== false };
      return account.id ? patch(`/accounts/${account.id}`, body) : post('/accounts', body);
    },
    'Account saved',
    onClose,
  );
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={account.id ? 'Edit account' : 'New account'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="Code">
          <Input value={v.code} onChange={set('code')} required />
        </Field>
        <Field label="Type">
          <Select value={v.type} onChange={set('type')}>
            {['asset', 'liability', 'equity', 'income', 'expense'].map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" className="col-span-2">
          <Input value={v.name} onChange={set('name')} required />
        </Field>
        <Field label="Parent group">
          <Select value={v.parentId ?? ''} onChange={set('parentId')}>
            <option value="">— Top level —</option>
            {groups
              .filter((g) => g.type === v.type && g.id !== account.id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} — {g.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Subtype">
          <Select value={v.subtype ?? ''} onChange={set('subtype')}>
            <option value="">—</option>
            {['cash', 'bank', 'receivable', 'payable', 'tax', 'inventory', 'fixed_asset', 'wip', 'retention'].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v.isGroup} onChange={(e) => setV({ ...v, isGroup: e.target.checked })} /> Group (no postings)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.isActive !== false} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Active
        </label>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Mappings() {
  const maps = useGet<Row[]>('/accounts/mappings');
  const accts = useGet<Row[]>('/accounts');
  const save = useAction(({ key, accountId }: { key: string; accountId: string }) => put(`/accounts/mappings/${key}`, { accountId }), 'Posting rule updated');
  if (maps.isLoading || accts.isLoading) return <Loading />;
  const leaf = (accts.data ?? []).filter((a) => !a.isGroup);
  return (
    <Card title="Which account each automatic posting uses">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {maps.data?.map((m) => (
            <tr key={m.key}>
              <td className="w-1/3 py-2 font-medium">{titleCase(m.key)}</td>
              <td>
                <Select value={m.accountId} disabled={!can('finance.account.update')} onChange={(e) => save.mutate({ key: m.key, accountId: e.target.value })}>
                  {leaf.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
