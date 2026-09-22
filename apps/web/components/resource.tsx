'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Printer, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, cn, ErrorBox, Field, Input, LinkButton, Loading, PageHeader, Select, Textarea } from './ui';
import { api, ApiError, can, get, qs } from '@/lib/api';
import { useAction, useLookups } from '@/lib/hooks';
import { date, dateTime, money, qty, titleCase } from '@/lib/format';
import { basePath } from '@/lib/resource-types';
import type { ActionDef, ColumnDef, FieldDef, LineColumn, Option, OptionSource, ResourceDef, Row } from '@/lib/resource-types';

// ---------------- options ----------------

export function useOptions(source?: OptionSource, values: Row = {}) {
  const lookups = useLookups(source?.lookup ? [source.lookup] : []);
  const endpoint = useQuery({
    queryKey: ['options', source?.endpoint],
    queryFn: () => get<Row[] | { data: Row[] }>(source!.endpoint!),
    enabled: !!source?.endpoint,
    staleTime: 30_000,
  });
  return useMemo(() => {
    if (!source) return { rows: [] as Row[], options: [] as Option[] };
    const raw = source.lookup ? (lookups.data?.[source.lookup] ?? []) : endpoint.data ? (Array.isArray(endpoint.data) ? endpoint.data : endpoint.data.data) : [];
    const rows = (raw as Row[]).filter((r) => !source.filter || source.filter(r, values));
    const label = source.label ?? ((r: Row) => (r.code ? `${r.code} — ${r.name}` : r.name));
    return { rows, options: rows.map((r) => ({ value: String(r.id), label: label(r) })) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, lookups.data, endpoint.data, JSON.stringify(values)]);
}

const normalizeOptions = (opts: (string | Option)[] = []): Option[] => opts.map((o) => (typeof o === 'string' ? { value: o, label: titleCase(o) } : o));

// ---------------- cells ----------------

export function Cell({ col, row }: { col: ColumnDef; row: Row }) {
  if (col.render) return <>{col.render(row)}</>;
  const v = row[col.key];
  switch (col.format) {
    case 'money':
      return <span className="num">{money(v)}</span>;
    case 'qty':
      return <span className="num">{qty(v)}</span>;
    case 'date':
      return <>{date(v)}</>;
    case 'datetime':
      return <>{dateTime(v)}</>;
    case 'status':
      return <Badge value={v} />;
    case 'bool':
      return <>{v ? 'Yes' : 'No'}</>;
    default:
      return <>{v === null || v === undefined || v === '' ? '—' : String(v)}</>;
  }
}

const isNumeric = (c: ColumnDef) => c.format === 'money' || c.format === 'qty';

export function DataTable({ columns, rows, onRowClick, rowHref, actions, empty = 'No records' }: { columns: ColumnDef[]; rows: Row[]; onRowClick?: (r: Row) => void; rowHref?: (r: Row) => string | null; actions?: (r: Row) => ReactNode; empty?: string }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn('whitespace-nowrap px-3 py-2', isNumeric(c) && 'text-right')}>
                {c.label}
              </th>
            ))}
            {actions && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0)} className="px-3 py-10 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const href = rowHref?.(r);
            return (
              <tr
                key={r.id ?? i}
                className={cn((href || onRowClick) && 'cursor-pointer hover:bg-brand-50/40')}
                onClick={() => (onRowClick ? onRowClick(r) : href && router.push(href))}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2', isNumeric(c) && 'text-right')}>
                    <Cell col={c} row={r} />
                  </td>
                ))}
                {actions && (
                  <td className="whitespace-nowrap px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {actions(r)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- actions ----------------

export function ActionButton({ action, row, size }: { action: ActionDef; row: Row; size?: 'sm' | 'md' }) {
  const router = useRouter();
  const run = useAction(
    () => api<Row>(action.path(row), { method: action.method === 'delete' ? 'DELETE' : 'POST', json: action.method === 'delete' ? undefined : (action.body?.(row) ?? {}) }),
    `${action.label} — done`,
    (res) => {
      const to = action.redirect?.(res, row);
      if (to) router.push(to);
    },
  );
  if (action.when && !action.when(row)) return null;
  if (action.perm && !can(action.perm)) return null;
  return (
    <Button
      size={size}
      variant={action.variant ?? 'primary'}
      loading={run.isPending}
      onClick={() => {
        if (!action.confirm || confirm(action.confirm)) run.mutate();
      }}
    >
      {action.label}
    </Button>
  );
}

// ---------------- list ----------------

export function ResourceList({ def, initialParams = {} }: { def: ResourceDef; initialParams?: Record<string, string> }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({ ...def.defaultParams, ...initialParams });
  const params = { page, pageSize: 25, search: term, ...filters };
  const q = useQuery({ queryKey: [def.endpoint, params], queryFn: () => get<{ data: Row[]; total: number } | Row[]>(def.endpoint + qs(params)) });
  const rows = Array.isArray(q.data) ? q.data : (q.data?.data ?? []);
  const total = Array.isArray(q.data) ? rows.length : (q.data?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / 25));
  useEffect(() => setPage(1), [term, JSON.stringify(filters)]);

  const createHref = def.createHref ?? (def.form ? `${basePath(def)}/new` : null);
  const linkable = !def.noLink && (def.editable || def.detail);

  return (
    <div>
      <PageHeader
        title={def.title}
        subtitle={q.data ? `${total} record${total === 1 ? '' : 's'}` : undefined}
        actions={
          createHref && can(`${def.perm}.create`) ? (
            <LinkButton href={createHref}>
              <Plus className="h-4 w-4" /> New {def.singular.toLowerCase()}
            </LinkButton>
          ) : null
        }
      />
      {(def.searchable || def.filters?.length) && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          {def.searchable && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTerm(search);
              }}
              className="relative"
            >
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => setTerm(search)} placeholder="Search…" className="w-64 pl-8" />
            </form>
          )}
          {def.filters?.map((f) => <FilterSelect key={f.name} field={f} value={filters[f.name] ?? ''} onChange={(v) => setFilters({ ...filters, [f.name]: v })} />)}
        </div>
      )}
      <ErrorBox error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          columns={def.columns}
          rows={rows}
          rowHref={linkable ? (r) => `${basePath(def)}/${r.id}` : undefined}
          actions={def.rowActions ? (r) => <div className="flex justify-end gap-1">{def.rowActions!.map((a) => <ActionButton key={a.label} action={a} row={r} size="sm" />)}</div> : undefined}
        />
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-slate-500">
          Page {page} of {pages}
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const { options } = useOptions(field.source);
  const opts = field.options ? normalizeOptions(field.options) : options;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-48">
      <option value="">All {field.label.toLowerCase()}</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

// ---------------- form fields ----------------

export function FormField({ field, value, onChange, error, values }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string; values: Row }) {
  const { options } = useOptions(field.source, values);
  const opts = field.options ? normalizeOptions(field.options) : options;
  const span = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-2 lg:col-span-4' }[field.span ?? 1];
  const str = value === null || value === undefined ? '' : String(value);

  let control: ReactNode;
  switch (field.type) {
    case 'textarea':
      control = <Textarea value={str} onChange={(e) => onChange(e.target.value)} required={field.required} />;
      break;
    case 'checkbox':
      return (
        <label className={cn('flex items-center gap-2 self-end pb-2 text-sm', span)}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          {field.label}
        </label>
      );
    case 'multi': {
      const selected = new Set((value as string[]) ?? []);
      control = (
        <div className="flex flex-wrap gap-3 rounded-md border border-slate-200 p-2">
          {opts.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(o.value);
                  else next.delete(o.value);
                  onChange([...next]);
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'select':
      control = (
        <Select value={str} onChange={(e) => onChange(e.target.value)} required={field.required}>
          <option value="">— Select —</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    default:
      control = (
        <Input
          type={field.type === 'decimal' ? 'text' : field.type === 'number' ? 'number' : (field.type ?? 'text')}
          inputMode={field.type === 'decimal' ? 'decimal' : undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          autoComplete={field.type === 'password' ? 'new-password' : undefined}
        />
      );
  }
  return (
    <Field label={field.label + (field.required ? ' *' : '')} error={error} hint={field.hint} className={span}>
      {control}
    </Field>
  );
}

function LineCell({ col, value, onChange, onPick }: { col: LineColumn; value: unknown; onChange: (v: string) => void; onPick: (r: Row) => void }) {
  const { rows, options } = useOptions(col.source);
  const opts = col.options ? normalizeOptions(col.options) : options;
  const str = value === null || value === undefined ? '' : String(value);
  if (col.type === 'select') {
    return (
      <Select
        value={str}
        onChange={(e) => {
          onChange(e.target.value);
          const picked = rows.find((r) => String(r.id) === e.target.value);
          if (picked) onPick(picked);
        }}
        className="py-1.5"
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }
  return <Input value={str} inputMode={col.type === 'decimal' ? 'decimal' : undefined} onChange={(e) => onChange(e.target.value)} className={cn('py-1.5', col.type === 'decimal' && 'text-right')} />;
}

export function LinesEditor({ def, lines, setLines }: { def: NonNullable<NonNullable<ResourceDef['form']>['lines']>; lines: Row[]; setLines: (l: Row[]) => void }) {
  const update = (i: number, patch: Row) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = def.amount ? lines.reduce((a, l) => a + def.amount!(l), 0) : null;
  return (
    <Card title="Lines" className="mt-4" actions={<Button type="button" size="sm" variant="secondary" onClick={() => setLines([...lines, def.newLine()])}><Plus className="h-3.5 w-3.5" /> Add line</Button>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="w-8 pb-2">#</th>
              {def.columns.map((c) => (
                <th key={c.name} className="pb-2 pr-2" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              {def.amount && <th className="pb-2 text-right">Amount</th>}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 text-slate-400">{i + 1}</td>
                {def.columns.map((c) => (
                  <td key={c.name} className="py-1 pr-2">
                    <LineCell col={c} value={l[c.name]} onChange={(v) => update(i, { [c.name]: v })} onPick={(r) => c.onPick && setLines(lines.map((x, j) => (j === i ? c.onPick!(r, { ...x, [c.name]: String(r.id) }) : x)))} />
                  </td>
                ))}
                {def.amount && <td className="num py-2.5 text-right">{money(def.amount(l))}</td>}
                <td className="py-1">
                  <button type="button" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {total !== null && (
            <tfoot>
              <tr>
                <td colSpan={def.columns.length + 1} className="pt-3 text-right text-xs font-medium uppercase text-slate-500">
                  Total before tax
                </td>
                <td className="num pt-3 text-right font-semibold">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

// ---------------- form ----------------

function cleanBody(values: Row, def: ResourceDef, isEdit: boolean): Row {
  const out: Row = {};
  for (const f of def.form!.fields) {
    if (isEdit && f.createOnly) continue;
    if (f.showIf && !f.showIf(values)) continue;
    let v = values[f.name];
    if (v === '' || v === undefined) v = f.type === 'checkbox' ? false : null;
    if (f.type === 'number' && v !== null) v = Number(v);
    if (f.type === 'password' && !v) continue;
    if (f.createOnly && v === null) continue;
    out[f.name] = v;
  }
  if (def.form!.lines) {
    out.lines = (values.lines as Row[]).map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v === '' ? null : v])));
  }
  return def.form!.transform ? def.form!.transform(out) : out;
}

export function ResourceForm({ def, id, initial }: { def: ResourceDef; id?: string; initial?: Row }) {
  const router = useRouter();
  const isEdit = !!id;
  const defaults = useMemo(() => {
    const d: Row = {};
    for (const f of def.form!.fields) d[f.name] = f.default ?? (f.type === 'checkbox' ? false : '');
    if (def.form!.lines) d.lines = [def.form!.lines.newLine()];
    return { ...d, ...initial };
  }, [def, initial]);
  const [values, setValues] = useState<Row>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | 'save' | 'post'>(null);
  useEffect(() => setValues(defaults), [defaults]);

  async function save(post: boolean) {
    setSaving(post ? 'post' : 'save');
    setErrors({});
    setError(null);
    try {
      const body = cleanBody(values, def, isEdit);
      const res = await api<Row>(isEdit ? `${def.endpoint}/${id}` : def.endpoint + (def.form!.postable ? `?post=${post}` : ''), { method: isEdit ? 'PATCH' : 'POST', json: body });
      router.push(def.detail || def.editable ? `${basePath(def)}/${res.id ?? id}` : basePath(def));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'errors' in e.body) {
        const map: Record<string, string> = {};
        for (const x of (e.body as { errors: { path: string; message: string }[] }).errors) map[x.path] = x.message;
        setErrors(map);
      }
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title={isEdit ? `Edit ${def.singular.toLowerCase()}` : `New ${def.singular.toLowerCase()}`}
        actions={
          <Link href={basePath(def)} className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to {def.title.toLowerCase()}
          </Link>
        }
      />
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {def.form!.fields
            .filter((f) => (!f.showIf || f.showIf(values)) && !(isEdit && f.createOnly))
            .map((f) => (
              <FormField key={f.name} field={f} value={values[f.name]} values={values} error={errors[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
            ))}
        </div>
      </Card>
      {def.form!.lines && <LinesEditor def={def.form!.lines} lines={values.lines as Row[]} setLines={(lines) => setValues((s) => ({ ...s, lines }))} />}
      {Object.keys(errors).some((k) => k.startsWith('lines')) && <p className="mt-2 text-xs text-red-600">Check the lines: {Object.entries(errors).filter(([k]) => k.startsWith('lines')).map(([k, v]) => `${k.replace('lines.', 'line ')}: ${v}`).join('; ')}</p>}
      <div className="mt-4 space-y-3">
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <Button type="submit" variant={def.form!.postable ? 'secondary' : 'primary'} loading={saving === 'save'}>
            {isEdit ? 'Save changes' : def.form!.postable ? 'Save as draft' : `Create ${def.singular.toLowerCase()}`}
          </Button>
          {def.form!.postable && !isEdit && (
            <Button type="button" loading={saving === 'post'} onClick={() => save(true)}>
              Save &amp; post
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

// ---------------- document view ----------------

export function DocumentView({ def, row }: { def: ResourceDef; row: Row }) {
  const d = def.detail!;
  const lines = d.lines ? ((row[d.lines.key] as Row[]) ?? []) : [];
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {def.singular} {row.no ?? row.code ?? ''} <Badge value={row.status} />
          </span>
        }
        actions={
          <>
            <Link href={basePath(def)} className="self-center text-sm text-slate-500 hover:text-slate-700">
              ← All {def.title.toLowerCase()}
            </Link>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {d.actions?.map((a) => <ActionButton key={a.label} action={a} row={row} />)}
          </>
        }
      />
      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
          {d.fields.map((f) => (
            <div key={f.key}>
              <dt className="text-xs text-slate-500">{f.label}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                <Cell col={f} row={row} />
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      {d.lines && (
        <div className="mt-4">
          <DataTable columns={d.lines.columns} rows={lines} empty="No lines" />
        </div>
      )}
      {d.extra && <div className="no-print mt-4">{d.extra(row)}</div>}
    </div>
  );
}
