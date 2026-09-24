'use client';

import { useQuery } from '@tanstack/react-query';
import { Database, LogIn, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { bytes, PlatformShell } from '@/components/platform-shell';
import { DataTable } from '@/components/resource';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Stat, Tabs } from '@/components/ui';
import { get, getSession, parkPlatformSession, post, put, setSession } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { date, dateTime, money, titleCase } from '@/lib/format';
import { MODULE_KEYS, MODULES } from '@erp/shared';
import type { Row } from '@/lib/resource-types';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'modules', label: 'Modules & plan' },
  { key: 'users', label: 'Users' },
  { key: 'activity', label: 'Activity' },
  { key: 'provisioning', label: 'Provisioning' },
];

export default function TenantControlPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState('overview');
  const [impersonate, setImpersonate] = useState<{ userId?: string; name: string } | null>(null);
  const q = useQuery({
    queryKey: ['platform-tenant', id],
    queryFn: () => get<Row>(`/platform/tenants/${id}`),
    refetchInterval: (r) => (r.state.data?.status === 'provisioning' ? 1500 : false),
  });
  const setStatus = useAction((action: 'suspend' | 'activate') => post(`/platform/tenants/${id}/${action}`), 'Company status updated');

  if (q.isLoading) return <PlatformShell><Loading /></PlatformShell>;
  if (q.error) return <PlatformShell><ErrorBox error={q.error} /></PlatformShell>;
  const t = q.data!;
  const s = t.stats as Row | null;

  return (
    <PlatformShell>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t.name} <Badge value={t.status} />
          </span>
        }
        subtitle={
          <span className="font-mono text-xs">
            {t.slug} · <Database className="inline h-3 w-3" /> {t.database?.dbName ?? 'no database'} · {bytes(t.database?.sizeBytes)} · schema {t.database?.lastMigratedAt ? dateTime(t.database.lastMigratedAt) : '—'}
          </span>
        }
        actions={
          <>
            <Link href="/platform" className="self-center text-sm text-slate-500 hover:text-slate-700">
              ← All companies
            </Link>
            {t.status === 'active' && (
              <>
                <Button onClick={() => setImpersonate({ name: 'the company administrator' })}>
                  <LogIn className="h-4 w-4" /> Log in as tenant
                </Button>
                <Button variant="secondary" onClick={() => confirm(`Suspend ${t.name}? Users are locked out immediately.`) && setStatus.mutate('suspend')}>
                  <Pause className="h-4 w-4" /> Suspend
                </Button>
              </>
            )}
            {t.status === 'suspended' && (
              <Button onClick={() => setStatus.mutate('activate')}>
                <Play className="h-4 w-4" /> Activate
              </Button>
            )}
          </>
        }
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Users" value={s?.users.total ?? '—'} sub={`${s?.users.active30d ?? 0} active in 30 days`} />
          <Stat label="Employees" value={s?.employees.active ?? '—'} />
          <Stat label="Projects" value={s ? `${s.projects.active} / ${s.projects.total}` : '—'} sub={s ? `Contract ${money(s.projects.contractValue)}` : undefined} />
          <Stat label="Invoiced" value={s ? money(s.sales.total) : '—'} sub={s ? `${s.sales.count} invoices` : undefined} />
          <Stat label="Purchase orders" value={s ? money(s.purchases.total) : '—'} sub={s ? `${s.purchases.count} orders` : undefined} />
          <Stat label="Files" value={s ? `${s.files.count}` : '—'} sub={s ? bytes(Number(s.files.bytes)) : undefined} />
          <Stat label="Database" value={bytes(t.database?.sizeBytes)} />
          <Stat label="Activity (7 days)" value={s?.activity.last7d ?? '—'} sub={s?.activity.lastAt ? `Last ${dateTime(s.activity.lastAt)}` : 'No activity'} />
        </div>
      )}

      {tab === 'modules' && <ModulesTab id={id} tenant={t} />}

      {tab === 'users' && (
        <DataTable
          rows={t.users as Row[]}
          empty="No users"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'email', label: 'Email' },
            { key: 'roles', label: 'Roles', render: (r) => (r.roles as string[]).join(', ') },
            { key: 'lastLoginAt', label: 'Last login', format: 'datetime' },
            { key: 'isActive', label: 'Active', format: 'bool' },
          ]}
          actions={(r) =>
            t.status === 'active' && r.isActive ? (
              <Button size="sm" variant="secondary" onClick={() => setImpersonate({ userId: r.id, name: r.name })}>
                <LogIn className="h-3.5 w-3.5" /> Log in as
              </Button>
            ) : null
          }
        />
      )}

      {tab === 'activity' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Company audit trail">
            <DataTable
              rows={t.recentAudit as Row[]}
              empty="No activity"
              columns={[
                { key: 'at', label: 'When', format: 'datetime' },
                { key: 'userName', label: 'User' },
                { key: 'action', label: 'Action', format: 'status' },
                { key: 'entity', label: 'Entity' },
                { key: 'impersonatedBy', label: 'Via platform' },
              ]}
            />
          </Card>
          <Card title="Platform actions on this company">
            <DataTable
              rows={t.platformAudit as Row[]}
              empty="No platform actions"
              columns={[
                { key: 'at', label: 'When', format: 'datetime' },
                { key: 'adminEmail', label: 'Admin' },
                { key: 'action', label: 'Action', render: (r) => titleCase(String(r.action).replace(/\./g, ' ')) },
                { key: 'details', label: 'Details', render: (r) => <span className="text-xs text-slate-500">{r.details ? JSON.stringify(r.details).slice(0, 120) : '—'}</span> },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'provisioning' && (
        <div className="space-y-3">
          {(t.jobs as Row[]).map((j) => (
            <Card key={j.id} title={`${j.kind} · ${dateTime(j.startedAt)}`} actions={<Badge value={j.status === 'succeeded' ? 'active' : j.status} />}>
              <pre className="max-h-60 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{(j.log as string[]).join('\n')}</pre>
              {j.error ? <ErrorBox error={j.error} /> : null}
            </Card>
          ))}
          {!(t.jobs as Row[]).length && <p className="text-sm text-slate-500">No provisioning runs recorded.</p>}
        </div>
      )}

      {impersonate && <ImpersonateModal tenantId={id} target={impersonate} onClose={() => setImpersonate(null)} />}
    </PlatformShell>
  );
}

function ModulesTab({ id, tenant }: { id: string; tenant: Row }) {
  const [modules, setModules] = useState<Record<string, boolean>>(tenant.modules as Record<string, boolean>);
  const sub = tenant.subscription as Row | null;
  const [plan, setPlan] = useState(String(sub?.plan ?? tenant.plan ?? 'standard'));
  const [maxUsers, setMaxUsers] = useState(String(sub?.maxUsers ?? 25));
  const [endsAt, setEndsAt] = useState(sub?.endsAt ? String(sub.endsAt).slice(0, 10) : '');
  const saveModules = useAction(() => put(`/platform/tenants/${id}/modules`, { modules }), 'Modules updated — users see the change immediately');
  const saveSub = useAction(() => put(`/platform/tenants/${id}/subscription`, { plan, maxUsers: Number(maxUsers), endsAt: endsAt || null }), 'Plan updated');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Licensed modules" actions={<Button size="sm" onClick={() => saveModules.mutate()} loading={saveModules.isPending}>Save modules</Button>}>
        <ul className="divide-y">
          {MODULE_KEYS.map((k) => (
            <li key={k} className="flex items-center justify-between py-2.5">
              <div>
                <div className="text-sm font-medium">{MODULES[k].label}</div>
                <div className="text-xs text-slate-500">Permissions starting with “{MODULES[k].prefixes[0]}.”</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={!!modules[k]} onChange={(e) => setModules({ ...modules, [k]: e.target.checked })} className="h-4 w-4" />
                {modules[k] ? 'Enabled' : 'Disabled'}
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Disabling a module strips its permissions from every user of this company, hides its menus and blocks its API routes.</p>
      </Card>
      <Card title="Subscription" actions={<Button size="sm" onClick={() => saveSub.mutate()} loading={saveSub.isPending}>Save plan</Button>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan">
            <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
          </Field>
          <Field label="Max active users">
            <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
          </Field>
          <Field label="Valid until" hint="Blank = open-ended">
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <div className="self-end pb-2 text-sm text-slate-500">
            {tenant.stats ? `${(tenant.stats as Row).users.total} users created` : ''}
          </div>
        </div>
        {sub?.startsAt && <p className="mt-3 text-xs text-slate-500">Started {date(sub.startsAt)}</p>}
      </Card>
    </div>
  );
}

function ImpersonateModal({ tenantId, target, onClose }: { tenantId: string; target: { userId?: string; name: string }; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const go = useAction(
    () => post<Row>(`/platform/tenants/${tenantId}/impersonate`, { userId: target.userId, reason }),
    'Signed in to the company',
    (res) => {
      const platform = getSession();
      if (platform) parkPlatformSession(platform);
      setSession({ scope: 'tenant', tenant: (res.tenant as Row).slug, accessToken: res.accessToken as string, profile: res.profile as never });
      // Full page load: a client-side push would race this screen's own "platform only" guard,
      // which sees the new tenant session and bounces to the platform login.
      window.location.assign('/');
    },
  );
  return (
    <Modal open onClose={onClose} title={`Log in as ${target.name}`}>
      <div className="space-y-3 text-sm">
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-800">
          You will act inside the company with that user&apos;s permissions for one hour. Every action is written to the company&apos;s audit trail with your email, and the session start is recorded on the platform audit log.
        </p>
        <Field label="Reason (required)" hint="Shown in both audit logs, e.g. a support ticket number">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Support ticket #123 — payroll not posting" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => go.mutate()} loading={go.isPending} disabled={reason.trim().length < 3}>
            Start support session
          </Button>
        </div>
      </div>
    </Modal>
  );
}
