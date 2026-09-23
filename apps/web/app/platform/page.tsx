'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Database, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { bytes, PlatformShell } from '@/components/platform-shell';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Stat } from '@/components/ui';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { dateTime, money, titleCase } from '@/lib/format';
import { MODULE_KEYS, MODULES } from '@erp/shared';
import type { Row } from '@/lib/resource-types';

export default function PlatformOverviewPage() {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['platform-overview'],
    queryFn: () => get<Row>('/platform/overview'),
    refetchInterval: (r) => ((r.state.data?.tenants as Row[] | undefined)?.some((t) => t.status === 'provisioning') ? 1500 : 30_000),
  });
  const migrate = useAction(() => post<{ slug: string; ok: boolean; error?: string }[]>('/platform/tenants/migrate'), 'Migrations applied to all active companies');

  return (
    <PlatformShell>
      <PageHeader
        title="Platform overview"
        subtitle="Every company, its licensed modules, usage and health — each on its own database."
        actions={
          <>
            <Button variant="secondary" onClick={() => migrate.mutate()} loading={migrate.isPending}>
              <RefreshCw className="h-4 w-4" /> Migrate all
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New company
            </Button>
          </>
        }
      />
      {migrate.data && (
        <Card className="mb-4" title="Migration results">
          <ul className="space-y-1 text-sm">
            {migrate.data.map((r) => (
              <li key={r.slug} className={r.ok ? 'text-emerald-700' : 'text-red-600'}>
                {r.ok ? '✔' : '✘'} {r.slug} {r.error}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <Overview data={q.data!} />
      )}
      <CreateTenant open={open} onClose={() => setOpen(false)} />
    </PlatformShell>
  );
}

function Overview({ data }: { data: Row }) {
  const t = data.totals as Row;
  const tenants = data.tenants as Row[];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Companies" value={t.tenants} sub={`${t.active} active · ${t.suspended} suspended${t.failed ? ` · ${t.failed} failed` : ''}`} />
        <Stat label="Users" value={t.users} sub={`${t.activeUsers30d} signed in (30 days)`} />
        <Stat label="Employees managed" value={t.employees} />
        <Stat label="Active projects" value={t.activeProjects} sub={`Contract value ${money(t.contractValue)}`} />
        <Stat label="Invoiced (all companies)" value={money(t.sales)} />
        <Stat label="Database size" value={bytes(Number(t.dbBytes))} />
        <Stat label="Files stored" value={bytes(Number(t.storageBytes))} />
        <Stat label="Module adoption" value={`${(data.moduleAdoption as Row[]).reduce((a, m) => a + Number(m.tenants), 0)} licences`} />
      </div>

      <Card title="Companies">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Company</th>
                <th className="pb-2">Database</th>
                <th className="pb-2">Modules</th>
                <th className="pb-2 text-right">Users</th>
                <th className="pb-2 text-right">Projects</th>
                <th className="pb-2 text-right">Invoiced</th>
                <th className="pb-2 text-right">Size</th>
                <th className="pb-2">Last activity</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((tn) => (
                <tr key={tn.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => (window.location.href = `/platform/tenants/${tn.id}`)}>
                  <td className="py-2">
                    <Link href={`/platform/tenants/${tn.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                      {tn.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-400">{tn.slug}</div>
                  </td>
                  <td className="font-mono text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      {tn.dbName ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-slate-600">{(tn.modules as string[]).length}/{MODULE_KEYS.length}</span>
                  </td>
                  <td className="num text-right">{tn.stats?.users.total ?? '—'}</td>
                  <td className="num text-right">{tn.stats?.projects.active ?? '—'}</td>
                  <td className="num text-right">{tn.stats ? money(tn.stats.sales.total) : '—'}</td>
                  <td className="num text-right">{bytes(tn.dbSizeBytes)}</td>
                  <td className="text-xs text-slate-500">{tn.stats?.activity.lastAt ? dateTime(tn.stats.activity.lastAt) : '—'}</td>
                  <td>
                    <Badge value={tn.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Module adoption">
          <ul className="space-y-2 text-sm">
            {(data.moduleAdoption as Row[]).map((m) => (
              <li key={m.module}>
                <div className="flex justify-between">
                  <span>{MODULES[m.module as keyof typeof MODULES]?.label ?? m.label}</span>
                  <span className="text-slate-500">
                    {m.tenants} / {tenants.length}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div className="h-2 rounded bg-brand-500" style={{ width: `${tenants.length ? (Number(m.tenants) / tenants.length) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Recent platform activity">
          <ul className="divide-y text-sm">
            {(data.recentActivity as Row[]).map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-1.5">
                <span>
                  <b>{titleCase(String(a.action).replace(/\./g, ' '))}</b> <span className="text-slate-500">{a.adminEmail}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{dateTime(a.at)}</span>
              </li>
            ))}
            {!(data.recentActivity as Row[]).length && <li className="py-2 text-slate-400">Nothing yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function CreateTenant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const empty = { name: '', slug: '', contactEmail: '', adminName: '', adminEmail: '', adminPassword: '' };
  const [f, setF] = useState(empty);
  const [modules, setModules] = useState<string[]>([...MODULE_KEYS]);
  const create = useAction(
    () => post('/platform/tenants', { ...f, contactEmail: f.contactEmail || undefined, modules }),
    'Company created — provisioning its database…',
    () => {
      onClose();
      setF(empty);
    },
  );
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title="New company">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Company name" className="col-span-2">
          <Input value={f.name} onChange={set('name')} required />
        </Field>
        <Field label="Company ID" hint="Login ID and subdomain">
          <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} required pattern="[a-z][a-z0-9_]{2,39}" />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={f.contactEmail} onChange={set('contactEmail')} />
        </Field>
        <div className="col-span-2">
          <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
            <Building2 className="h-3.5 w-3.5" /> Licensed modules
          </span>
          <div className="flex flex-wrap gap-3 rounded-md border p-2">
            {MODULE_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={modules.includes(k)}
                  onChange={(e) => setModules(e.target.checked ? [...modules, k] : modules.filter((m) => m !== k))}
                />
                {MODULES[k].label}
              </label>
            ))}
          </div>
        </div>
        <div className="col-span-2 mt-2 text-xs font-semibold uppercase text-slate-500">First administrator</div>
        <Field label="Name">
          <Input value={f.adminName} onChange={set('adminName')} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.adminEmail} onChange={set('adminEmail')} required />
        </Field>
        <Field label="Password" className="col-span-2" hint="At least 8 characters">
          <Input type="password" value={f.adminPassword} onChange={set('adminPassword')} required minLength={8} />
        </Field>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create &amp; provision
          </Button>
        </div>
      </form>
    </Modal>
  );
}
