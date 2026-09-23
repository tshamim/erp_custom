'use client';

import { Pencil, Plus, Upload } from 'lucide-react';
import { ExportMenu, ImportDialog } from './file-tools';
import { FormEvent, useState } from 'react';
import { DataTable, useOptions } from './resource';
import { Badge, Button, Card, ErrorBox, Field, Input, LinkButton, Loading, Modal, Select, Stat, Textarea } from './ui';
import { can, del, get, post, put, qs } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { money, qty, titleCase, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';
import { useQuery } from '@tanstack/react-query';

// ---------------- overview ----------------

export function OverviewTab({ id }: { id: string }) {
  const q = useGet<Row>(`/projects/${id}/summary`);
  const [edit, setEdit] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const t = s.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contract value" value={money(s.project.contractValue)} sub={Number(t.approvedVariations) ? `incl. variations ${money(t.approvedVariations)}` : undefined} />
        <Stat label="Billed to client (gross)" value={money(t.billedGross)} sub={`BOQ executed ${s.financialProgress}%`} />
        <Stat label="Cost to date" value={money(t.cost)} sub={`Budget ${money(t.budget)}`} />
        <Stat label="Profit to date" value={money(t.profit)} tone={Number(t.profit) < 0 ? 'bad' : 'good'} sub={`Revenue ${money(t.revenue)}`} />
        <Stat label="Physical progress" value={`${s.physicalProgress}%`} sub="Weighted WBS tasks" />
        <Stat label="Retention held by client" value={money(t.retentionHeld)} />
        <Stat label="Advance outstanding" value={money(t.advanceOutstanding)} sub={`Recovered ${money(t.advanceRecovered)}`} />
        <Stat label="Equipment usage" value={money(t.equipmentUsageCost)} sub={`${qty(t.equipmentHours)} hours logged`} />
      </div>
      <Card
        title="Budget vs actual"
        actions={
          can('construction.project.update') && (
            <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit budget
            </Button>
          )
        }
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="pb-2">Category</th>
              <th className="pb-2 text-right">Budget</th>
              <th className="pb-2 text-right">Actual</th>
              <th className="pb-2 text-right">Variance</th>
              <th className="w-1/3 pb-2 pl-4">Used</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(s.categories as Row[]).map((c) => {
              const pct = Number(c.budget) ? Math.min(100, (Number(c.actual) / Number(c.budget)) * 100) : 0;
              const over = Number(c.variance) < 0;
              return (
                <tr key={c.category}>
                  <td className="py-2">{titleCase(c.category)}</td>
                  <td className="num text-right">{money(c.budget)}</td>
                  <td className="num text-right">{money(c.actual)}</td>
                  <td className={`num text-right ${over ? 'text-red-600' : 'text-emerald-700'}`}>{money(c.variance)}</td>
                  <td className="pl-4">
                    <div className="h-2 rounded bg-slate-100">
                      <div className={`h-2 rounded ${over ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <BudgetModal open={edit} onClose={() => setEdit(false)} id={id} categories={s.categories} />
    </div>
  );
}

function BudgetModal({ open, onClose, id, categories }: { open: boolean; onClose: () => void; id: string; categories: Row[] }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(categories.map((c) => [c.category, String(Number(c.budget))])));
  const save = useAction(() => put(`/projects/${id}/budgets`, { budgets: Object.entries(vals).map(([category, amount]) => ({ category, amount: amount || '0' })) }), 'Budget saved', onClose);
  return (
    <Modal open={open} onClose={onClose} title="Project budget">
      <div className="space-y-3">
        {categories.map((c) => (
          <Field key={c.category} label={titleCase(c.category)}>
            <Input className="text-right" value={vals[c.category] ?? ''} onChange={(e) => setVals({ ...vals, [c.category]: e.target.value })} />
          </Field>
        ))}
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save budget
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- BOQ ----------------

export function BoqTab({ id }: { id: string }) {
  const q = useGet<Row[]>(`/projects/${id}/boq`);
  const est = useGet<Row[]>(`/projects/${id}/boq/materials`);
  const [editing, setEditing] = useState<Row | null>(null);
  const remove = useAction((itemId: string) => del(`/projects/${id}/boq/${itemId}`), 'BOQ item deleted');
  const [importOpen, setImportOpen] = useState(false);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  const total = rows.filter((r) => !r.isSection).reduce((a, r) => a + Number(r.amount), 0);
  return (
    <div className="space-y-4">
      <Card
        title={`Bill of Quantities · ${money(total)}`}
        actions={
          <>
            <ExportMenu title="Bill of Quantities" columns={BOQ_COLUMNS} load={() => rows} />
            {can('construction.boq.create') && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload className="h-3.5 w-3.5" /> Import
                </Button>
                <Button size="sm" onClick={() => setEditing({})}>
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
              </>
            )}
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Item</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Unit</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Rate</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-right">Executed</th>
                <th className="pb-2 text-right">%</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) =>
                r.isSection ? (
                  <tr key={r.id} className="bg-slate-50 font-semibold">
                    <td className="py-2">{r.code}</td>
                    <td colSpan={7}>{r.description}</td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td className="py-2">{r.code}</td>
                    <td className="max-w-md">{r.description}</td>
                    <td>{r.uom}</td>
                    <td className="num text-right">{qty(r.quantity)}</td>
                    <td className="num text-right">{money(r.rate)}</td>
                    <td className="num text-right">{money(r.amount)}</td>
                    <td className="num text-right">{qty(r.executedQty)}</td>
                    <td className="num text-right">{Number(r.quantity) ? ((Number(r.executedQty) / Number(r.quantity)) * 100).toFixed(1) : '0'}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      {Number(r.executedQty) === 0 && (
                        <Button size="sm" variant="ghost" onClick={() => confirm('Delete this BOQ item?') && remove.mutate(r.id)}>
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No BOQ items yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Material requirement (from rate analysis) vs issued">
        <DataTable
          rows={est.data ?? []}
          empty="Add materials to BOQ items to estimate requirements"
          columns={[
            { key: 'itemCode', label: 'Code' },
            { key: 'itemName', label: 'Material' },
            { key: 'uom', label: 'Unit' },
            { key: 'estimated', label: 'Estimated', format: 'qty' },
            { key: 'issued', label: 'Issued', format: 'qty' },
            { key: 'balance', label: 'Balance', format: 'qty' },
            { key: 'issuedValue', label: 'Issued value', format: 'money' },
          ]}
        />
      </Card>
      {editing && <BoqModal projectId={id} item={editing} onClose={() => setEditing(null)} />}
      <ImportDialog resource="boq" projectId={id} open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

const BOQ_COLUMNS = [
  { key: 'code', label: 'Item' },
  { key: 'description', label: 'Description' },
  { key: 'uom', label: 'Unit' },
  { key: 'quantity', label: 'Qty', format: 'qty' as const },
  { key: 'rate', label: 'Rate', format: 'money' as const },
  { key: 'amount', label: 'Amount', format: 'money' as const },
  { key: 'executedQty', label: 'Executed', format: 'qty' as const },
];

function BoqModal({ projectId, item, onClose }: { projectId: string; item: Row; onClose: () => void }) {
  const full = useGet<Row>(item.id ? `/projects/${projectId}/boq/${item.id}` : null);
  const items = useOptions({ endpoint: '/items/pick', label: (r) => `${r.code} — ${r.name} (${r.uom})` });
  const src = item.id ? full.data : item;
  const [f, setF] = useState<Row | null>(null);
  const v = f ?? (src ? { code: '', description: '', uom: '', quantity: '', rate: '', isSection: false, materials: [], ...src } : null);
  const save = useAction(
    () => {
      const body = {
        code: v!.code,
        description: v!.description,
        uom: v!.uom || null,
        quantity: v!.quantity || '0',
        rate: v!.rate || '0',
        isSection: !!v!.isSection,
        sortOrder: Number(v!.sortOrder ?? 0),
        materials: (v!.materials as Row[]).filter((m) => m.itemId && m.qtyPerUnit).map((m) => ({ itemId: m.itemId, qtyPerUnit: m.qtyPerUnit, wastagePercent: m.wastagePercent || '0' })),
      };
      return item.id ? put(`/projects/${projectId}/boq/${item.id}`, body) : post(`/projects/${projectId}/boq`, body);
    },
    'BOQ item saved',
    onClose,
  );
  const set = (k: string, val: unknown) => setF({ ...v!, [k]: val });
  return (
    <Modal open onClose={onClose} title={item.id ? 'Edit BOQ item' : 'New BOQ item'} wide>
      {!v ? (
        <Loading />
      ) : (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-4 gap-3">
            <Field label="Item no. *">
              <Input value={v.code} onChange={(e) => set('code', e.target.value)} required />
            </Field>
            <label className="col-span-3 flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={!!v.isSection} onChange={(e) => set('isSection', e.target.checked)} /> Section heading (no quantity)
            </label>
            <Field label="Description *" className="col-span-4">
              <Textarea value={v.description} onChange={(e) => set('description', e.target.value)} required />
            </Field>
            {!v.isSection && (
              <>
                <Field label="Unit">
                  <Input value={v.uom ?? ''} onChange={(e) => set('uom', e.target.value)} placeholder="cum, sft, rft…" />
                </Field>
                <Field label="Quantity">
                  <Input className="text-right" value={v.quantity} onChange={(e) => set('quantity', e.target.value)} />
                </Field>
                <Field label="Rate">
                  <Input className="text-right" value={v.rate} onChange={(e) => set('rate', e.target.value)} />
                </Field>
                <Field label="Amount">
                  <div className="num py-2 text-right font-semibold">{money(Number(v.quantity || 0) * Number(v.rate || 0))}</div>
                </Field>
              </>
            )}
          </div>
          {!v.isSection && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">Rate analysis — materials per unit</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => set('materials', [...(v.materials as Row[]), { itemId: '', qtyPerUnit: '', wastagePercent: '0' }])}>
                  <Plus className="h-3 w-3" /> Material
                </Button>
              </div>
              {(v.materials as Row[]).map((m, i) => (
                <div key={i} className="mb-1 grid grid-cols-6 gap-2">
                  <Select className="col-span-3" value={m.itemId} onChange={(e) => set('materials', (v.materials as Row[]).map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>
                    <option value="">— Material —</option>
                    {items.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <Input placeholder="Qty / unit" value={m.qtyPerUnit} onChange={(e) => set('materials', (v.materials as Row[]).map((x, j) => (j === i ? { ...x, qtyPerUnit: e.target.value } : x)))} />
                  <Input placeholder="Wastage %" value={m.wastagePercent} onChange={(e) => set('materials', (v.materials as Row[]).map((x, j) => (j === i ? { ...x, wastagePercent: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" onClick={() => set('materials', (v.materials as Row[]).filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------------- tasks ----------------

export function TasksTab({ id }: { id: string }) {
  const q = useGet<Row[]>(`/projects/${id}/tasks`);
  const [editing, setEditing] = useState<Row | null>(null);
  if (q.isLoading) return <Loading />;
  const tasks = q.data ?? [];
  const depth = (t: Row): number => (t.parentId ? 1 + depth(tasks.find((x) => x.id === t.parentId) ?? {}) : 0);
  return (
    <Card
      title="Work breakdown & schedule"
      actions={
        can('construction.task.create') && (
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        )
      }
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="pb-2">Code</th>
            <th className="pb-2">Task</th>
            <th className="pb-2">Start</th>
            <th className="pb-2">End</th>
            <th className="pb-2">Assignee</th>
            <th className="w-40 pb-2">Progress</th>
            <th className="pb-2">Status</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y">
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className="py-2">{t.code}</td>
              <td style={{ paddingLeft: depth(t) * 16 }}>{t.name}</td>
              <td>{t.startDate ?? '—'}</td>
              <td>{t.endDate ?? '—'}</td>
              <td>{t.assigneeName ?? '—'}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded bg-slate-100">
                    <div className="h-2 rounded bg-brand-500" style={{ width: `${Number(t.progress)}%` }} />
                  </div>
                  <span className="num w-10 text-right text-xs">{Number(t.progress)}%</span>
                </div>
              </td>
              <td>
                <Badge value={t.status} />
              </td>
              <td className="text-right">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
          {!tasks.length && (
            <tr>
              <td colSpan={8} className="py-8 text-center text-slate-400">
                No tasks yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {editing && <TaskModal projectId={id} task={editing} tasks={tasks} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function TaskModal({ projectId, task, tasks, onClose }: { projectId: string; task: Row; tasks: Row[]; onClose: () => void }) {
  const emps = useOptions({ endpoint: '/employees/pick', label: (r) => r.name });
  const [v, setV] = useState<Row>({ code: '', name: '', parentId: '', startDate: '', endDate: '', progress: '0', weight: '1', status: 'not_started', assigneeId: '', ...task });
  const save = useAction(
    () => {
      const body = {
        code: v.code,
        name: v.name,
        parentId: v.parentId || null,
        startDate: v.startDate || null,
        endDate: v.endDate || null,
        progress: String(Number(v.progress || 0)),
        weight: String(Number(v.weight || 1)),
        status: v.status,
        assigneeId: v.assigneeId || null,
      };
      return task.id ? put(`/projects/${projectId}/tasks/${task.id}`, body) : post(`/projects/${projectId}/tasks`, body);
    },
    'Task saved',
    onClose,
  );
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={task.id ? 'Edit task' : 'New task'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-2 gap-3"
      >
        <Field label="Code *">
          <Input value={v.code} onChange={set('code')} required />
        </Field>
        <Field label="Parent">
          <Select value={v.parentId ?? ''} onChange={set('parentId')}>
            <option value="">— None —</option>
            {tasks
              .filter((t) => t.id !== task.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Name *" className="col-span-2">
          <Input value={v.name} onChange={set('name')} required />
        </Field>
        <Field label="Start">
          <Input type="date" value={v.startDate ?? ''} onChange={set('startDate')} />
        </Field>
        <Field label="End">
          <Input type="date" value={v.endDate ?? ''} onChange={set('endDate')} />
        </Field>
        <Field label="Progress %">
          <Input type="number" min={0} max={100} value={Number(v.progress)} onChange={set('progress')} />
        </Field>
        <Field label="Weight">
          <Input value={v.weight} onChange={set('weight')} />
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={set('status')}>
            {['not_started', 'in_progress', 'done', 'blocked'].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select value={v.assigneeId ?? ''} onChange={set('assigneeId')}>
            <option value="">—</option>
            {emps.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Save task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- linked document lists ----------------

export function LinkedList({ endpoint, projectId, columns, base, newHref, newLabel }: { endpoint: string; projectId: string; columns: Parameters<typeof DataTable>[0]['columns']; base: string; newHref?: string; newLabel?: string }) {
  const q = useQuery({ queryKey: [endpoint, { projectId }], queryFn: () => get<{ data: Row[] }>(endpoint + qs({ projectId, pageSize: 100 })) });
  return (
    <div className="space-y-3">
      {newHref && (
        <div className="flex justify-end">
          <LinkButton href={newHref}>
            <Plus className="h-4 w-4" /> {newLabel}
          </LinkButton>
        </div>
      )}
      {q.isLoading ? <Loading /> : <DataTable columns={columns} rows={q.data?.data ?? []} rowHref={(r) => `${base}/${r.id}`} />}
    </div>
  );
}

// ---------------- DPR ----------------

export function DprTab({ id }: { id: string }) {
  const q = useGet<Row[]>(`/projects/${id}/dpr`);
  const [v, setV] = useState({ date: today(), weather: '', workDone: '', issues: '', nextDayPlan: '', manpower: 'Mason:0, Helper:0' });
  const save = useAction(
    () =>
      post('/dpr', {
        projectId: id,
        date: v.date,
        weather: v.weather || null,
        workDone: v.workDone,
        issues: v.issues || null,
        nextDayPlan: v.nextDayPlan || null,
        manpower: v.manpower
          .split(',')
          .map((s) => s.split(':').map((x) => x.trim()))
          .filter(([trade]) => trade)
          .map(([trade, count]) => ({ trade, count: Number(count || 0) })),
      }),
    'Daily progress report saved',
    () => setV({ ...v, workDone: '', issues: '', nextDayPlan: '' }),
  );
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {can('construction.dpr.create') && (
        <Card title="Daily progress report" className="lg:col-span-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
              </Field>
              <Field label="Weather">
                <Input value={v.weather} onChange={(e) => setV({ ...v, weather: e.target.value })} placeholder="Sunny / Rain" />
              </Field>
            </div>
            <Field label="Work done *">
              <Textarea value={v.workDone} onChange={(e) => setV({ ...v, workDone: e.target.value })} required />
            </Field>
            <Field label="Manpower" hint="trade:count, comma separated">
              <Input value={v.manpower} onChange={(e) => setV({ ...v, manpower: e.target.value })} />
            </Field>
            <Field label="Issues / delays">
              <Textarea value={v.issues} onChange={(e) => setV({ ...v, issues: e.target.value })} />
            </Field>
            <Field label="Plan for next day">
              <Textarea value={v.nextDayPlan} onChange={(e) => setV({ ...v, nextDayPlan: e.target.value })} />
            </Field>
            <Button type="submit" loading={save.isPending}>
              Save report
            </Button>
          </form>
        </Card>
      )}
      <div className="space-y-3 lg:col-span-3">
        {q.data?.map((d) => (
          <Card key={d.id} title={`${d.date}${d.weather ? ` · ${d.weather}` : ''}`}>
            <p className="whitespace-pre-wrap text-sm">{d.workDone}</p>
            {(d.manpower as Row[]).length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Manpower: {(d.manpower as Row[]).map((m) => `${m.trade} ${m.count}`).join(' · ')} (total {(d.manpower as Row[]).reduce((a, m) => a + Number(m.count), 0)})
              </p>
            )}
            {d.issues && <p className="mt-2 text-sm text-red-700">Issues: {d.issues}</p>}
            {d.nextDayPlan && <p className="mt-1 text-sm text-slate-600">Next: {d.nextDayPlan}</p>}
          </Card>
        ))}
        {!q.data?.length && <p className="text-sm text-slate-400">No reports yet</p>}
      </div>
    </div>
  );
}

// ---------------- equipment usage ----------------

export function EquipmentTab({ id }: { id: string }) {
  const logs = useGet<Row[]>(`/equipment-logs${qs({ projectId: id })}`);
  const eq = useOptions({ endpoint: '/equipment?pageSize=200', label: (r) => `${r.code} — ${r.name}` });
  const [v, setV] = useState({ equipmentId: '', date: today(), hours: '', fuelLiters: '0', remarks: '' });
  const save = useAction(() => post('/equipment-logs', { ...v, projectId: id, remarks: v.remarks || null }), 'Usage logged', () => setV({ ...v, hours: '', remarks: '' }));
  return (
    <div className="space-y-4">
      {can('construction.equipment.create') && (
        <Card title="Log equipment usage">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="grid grid-cols-2 items-end gap-3 md:grid-cols-6"
          >
            <Field label="Equipment" className="col-span-2">
              <Select value={v.equipmentId} onChange={(e) => setV({ ...v, equipmentId: e.target.value })} required>
                <option value="">—</option>
                {eq.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field label="Hours">
              <Input value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} required />
            </Field>
            <Field label="Fuel (L)">
              <Input value={v.fuelLiters} onChange={(e) => setV({ ...v, fuelLiters: e.target.value })} />
            </Field>
            <Button type="submit" loading={save.isPending}>
              Log
            </Button>
          </form>
        </Card>
      )}
      <DataTable
        rows={logs.data ?? []}
        columns={[
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'equipmentName', label: 'Equipment' },
          { key: 'hours', label: 'Hours', format: 'qty' },
          { key: 'fuelLiters', label: 'Fuel (L)', format: 'qty' },
          { key: 'cost', label: 'Cost', format: 'money' },
          { key: 'remarks', label: 'Remarks' },
        ]}
      />
    </div>
  );
}

// ---------------- variations ----------------

export function VariationsTab({ id }: { id: string }) {
  const q = useGet<Row[]>(`/projects/${id}/variations`);
  const [v, setV] = useState({ date: today(), description: '', amount: '' });
  const add = useAction(() => post('/variations', { projectId: id, ...v }), 'Variation recorded', () => setV({ date: today(), description: '', amount: '' }));
  const decide = useAction(({ vid, status }: { vid: string; status: string }) => post(`/variations/${vid}/decision`, { status }), 'Variation updated');
  const canEdit = can('construction.project.update');
  return (
    <div className="space-y-4">
      {canEdit && (
        <Card title="New variation order">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="grid grid-cols-1 items-end gap-3 md:grid-cols-6"
          >
            <Field label="Date">
              <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field label="Description" className="md:col-span-3">
              <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} required />
            </Field>
            <Field label="Amount (±)">
              <Input value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} required />
            </Field>
            <Button type="submit" loading={add.isPending}>
              Add
            </Button>
          </form>
        </Card>
      )}
      <DataTable
        rows={q.data ?? []}
        columns={[
          { key: 'no', label: 'No.' },
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'description', label: 'Description' },
          { key: 'amount', label: 'Amount', format: 'money' },
          { key: 'status', label: 'Status', format: 'status' },
        ]}
        actions={(r) =>
          canEdit && r.status === 'pending' ? (
            <div className="flex justify-end gap-1">
              <Button size="sm" onClick={() => decide.mutate({ vid: r.id, status: 'approved' })}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => decide.mutate({ vid: r.id, status: 'rejected' })}>
                Reject
              </Button>
            </div>
          ) : null
        }
      />
    </div>
  );
}
