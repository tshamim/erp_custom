'use client';

import Link from 'next/link';
import { Card, ErrorBox, Loading, PageHeader, Stat } from '@/components/ui';
import { useGet, useSession } from '@/lib/hooks';
import { money, qty } from '@/lib/format';

interface Dashboard {
  cash: string;
  receivable: string;
  payable: string;
  retentionReceivable: string;
  stockValue: string;
  monthIncome: string;
  monthExpense: string;
  monthProfit: string;
  projects: { active: number; total: number; contractValue: string };
  employees: { active: number; daily: number };
  attendanceToday: { present: number; absent: number };
  pending: { leave: number; pos: number; prs: number; siteReqs: number; raBills: number };
  lowStock: { code: string; name: string; onHand: string; reorderLevel: string }[];
  trend: { month: string; income: string; expense: string }[];
}

function TrendChart({ data }: { data: Dashboard['trend'] }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-400">No postings yet</p>;
  const max = Math.max(1, ...data.flatMap((d) => [Number(d.income), Number(d.expense)]));
  return (
    <div>
      <div className="flex h-44 items-end gap-4">
        {data.map((d) => (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-36 w-full items-end justify-center gap-1">
              <div className="w-1/3 rounded-t bg-brand-500" style={{ height: `${(Number(d.income) / max) * 100}%` }} title={`Income ${money(d.income)}`} />
              <div className="w-1/3 rounded-t bg-amber-400" style={{ height: `${(Math.max(0, Number(d.expense)) / max) * 100}%` }} title={`Expense ${money(d.expense)}`} />
            </div>
            <div className="text-[11px] text-slate-500">{d.month}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-brand-500" /> Income
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-400" /> Expense
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const session = useSession();
  const q = useGet<Dashboard>('/reports/dashboard');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const pendingItems = [
    { label: 'Leave requests', n: d.pending.leave, href: '/m/leave-requests?status=pending' },
    { label: 'Purchase orders to approve', n: d.pending.pos, href: '/m/purchase-orders?status=draft' },
    { label: 'Purchase requisitions', n: d.pending.prs, href: '/m/purchase-requisitions?status=submitted' },
    { label: 'Site requisitions', n: d.pending.siteReqs, href: '/m/site-requisitions?status=submitted' },
    { label: 'RA bills awaiting approval', n: d.pending.raBills, href: '/m/ra-bills?status=draft' },
  ];
  return (
    <div>
      <PageHeader title={`Welcome, ${session?.profile.user.name.split(' ')[0] ?? ''}`} subtitle={session?.profile.tenant?.name} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash & bank" value={money(d.cash)} />
        <Stat label="Receivable" value={money(d.receivable)} sub={`Retention held: ${money(d.retentionReceivable)}`} />
        <Stat label="Payable" value={money(d.payable)} />
        <Stat label="Stock value" value={money(d.stockValue)} />
        <Stat label="Income (this month)" value={money(d.monthIncome)} />
        <Stat label="Expense (this month)" value={money(d.monthExpense)} />
        <Stat label="Profit (this month)" value={money(d.monthProfit)} tone={Number(d.monthProfit) < 0 ? 'bad' : 'good'} />
        <Stat label="Active projects" value={d.projects.active} sub={`Open contract value ${money(d.projects.contractValue)}`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Income vs expense (6 months)" className="lg:col-span-2">
          <TrendChart data={d.trend} />
        </Card>
        <Card title="Needs attention">
          <ul className="divide-y text-sm">
            {pendingItems.map((p) => (
              <li key={p.label} className="flex items-center justify-between py-2">
                <Link href={p.href} className="hover:text-brand-600">
                  {p.label}
                </Link>
                <span className={p.n ? 'rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800' : 'text-slate-400'}>{p.n}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Workforce today">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-2xl font-semibold">{d.employees.active}</div>
              <div className="text-xs text-slate-500">Active staff</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-700">{d.attendanceToday.present}</div>
              <div className="text-xs text-slate-500">Present</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-red-600">{d.attendanceToday.absent}</div>
              <div className="text-xs text-slate-500">Absent</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">{d.employees.daily} daily-wage workers on roll</p>
        </Card>
        <Card title="Low stock" className="lg:col-span-2">
          {d.lowStock.length ? (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {d.lowStock.map((i) => (
                  <tr key={i.code}>
                    <td className="py-1.5">
                      {i.code} — {i.name}
                    </td>
                    <td className="num text-right text-red-600">{qty(i.onHand)}</td>
                    <td className="num text-right text-slate-400">reorder at {qty(i.reorderLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-400">All items above reorder level</p>
          )}
        </Card>
      </div>
    </div>
  );
}
