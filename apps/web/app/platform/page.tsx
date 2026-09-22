'use client';

import { useQuery } from '@tanstack/react-query';
import { Database, LogOut, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { get, post, setSession } from '@/lib/api';
import { useAction, useSession } from '@/lib/hooks';
import { dateTime } from '@/lib/format';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  dbName: string | null;
  schemaVersion: string | null;
  lastMigratedAt: string | null;
  createdAt: string;
}

export default function PlatformPage() {
  const router = useRouter();
  const session = useSession();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setReady(true);
    if (session?.scope !== 'platform') router.replace('/platform/login');
  }, [session, router]);

  const tenants = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => get<TenantRow[]>('/platform/tenants'),
    enabled: session?.scope === 'platform',
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === 'provisioning') ? 1500 : false),
  });
  const detail = useQuery({
    queryKey: ['platform-tenant', selected],
    queryFn: () => get<{ jobs: { id: string; kind: string; status: string; log: string[]; error: string | null; startedAt: string }[] }>(`/platform/tenants/${selected}`),
    enabled: !!selected,
  });
  const migrate = useAction(() => post<{ slug: string; ok: boolean; error?: string }[]>('/platform/tenants/migrate'), 'Migrations applied to all active companies');
  const setStatus = useAction(({ id, action }: { id: string; action: 'suspend' | 'activate' }) => post(`/platform/tenants/${id}/${action}`), 'Status updated');

  if (!ready || session?.scope !== 'platform') return <Loading />;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand-500" /> BuildERP Platform
        </div>
        <button
          className="flex items-center gap-1 text-sm text-slate-300 hover:text-white"
          onClick={() => {
            void post('/platform/auth/logout').catch(() => undefined);
            setSession(null);
            router.replace('/platform/login');
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>
      <main className="mx-auto max-w-6xl p-6">
        <PageHeader
          title="Companies"
          subtitle="Each company runs on its own dedicated PostgreSQL database."
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
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Company ID</th>
                <th className="px-4 py-2">Database</th>
                <th className="px-4 py-2">Schema</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.isLoading && (
                <tr>
                  <td colSpan={6}>
                    <Loading />
                  </td>
                </tr>
              )}
              {tenants.data?.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">
                    <button className="hover:underline" onClick={() => setSelected(t.id)}>
                      {t.name}
                    </button>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {t.dbName && (
                      <span className="inline-flex items-center gap-1">
                        <Database className="h-3 w-3" />
                        {t.dbName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{t.lastMigratedAt ? dateTime(t.lastMigratedAt) : '—'}</td>
                  <td className="px-4 py-2">
                    <Badge value={t.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.status === 'active' && (
                      <Button size="sm" variant="secondary" onClick={() => confirm(`Suspend ${t.name}? Users will be locked out.`) && setStatus.mutate({ id: t.id, action: 'suspend' })}>
                        Suspend
                      </Button>
                    )}
                    {t.status === 'suspended' && (
                      <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: t.id, action: 'activate' })}>
                        Activate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      <CreateTenant open={open} onClose={() => setOpen(false)} />
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Provisioning history" wide>
        {detail.isLoading ? (
          <Loading />
        ) : (
          detail.data?.jobs.map((j) => (
            <div key={j.id} className="mb-3 rounded border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <Badge value={j.status === 'succeeded' ? 'active' : j.status} /> {j.kind} · {dateTime(j.startedAt)}
              </div>
              <pre className="max-h-60 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{j.log.join('\n')}</pre>
              {j.error && <ErrorBox error={j.error} />}
            </div>
          ))
        )}
      </Modal>
    </div>
  );
}

function CreateTenant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: '', slug: '', contactEmail: '', adminName: '', adminEmail: '', adminPassword: '' });
  const create = useAction(
    () => post('/platform/tenants', { ...f, contactEmail: f.contactEmail || undefined }),
    'Company created — provisioning its database…',
    () => {
      onClose();
      setF({ name: '', slug: '', contactEmail: '', adminName: '', adminEmail: '', adminPassword: '' });
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
        <Field label="Company ID" hint="Used for login and subdomain (acme.yourdomain.com)">
          <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} required pattern="[a-z][a-z0-9_]{2,39}" />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={f.contactEmail} onChange={set('contactEmail')} />
        </Field>
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
