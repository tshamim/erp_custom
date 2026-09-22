'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { can, del, post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { titleCase } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function RolesPage() {
  const roles = useGet<Row[]>('/roles');
  const perms = useGet<{ key: string; module: string }[]>('/roles/permissions');
  const [edit, setEdit] = useState<Row | null>(null);
  if (roles.isLoading || perms.isLoading) return <Loading />;
  return (
    <div>
      <PageHeader title="Roles & permissions" actions={can('core.role.create') && <Button onClick={() => setEdit({ name: '', description: '', permissions: [] })}>New role</Button>} />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {roles.data?.map((r) => (
          <Card key={r.id} title={r.name} actions={r.name !== 'Admin' && can('core.role.update') && <Button size="sm" variant="secondary" onClick={() => setEdit(r)}>Edit</Button>}>
            <p className="text-sm text-slate-600">{r.description}</p>
            <p className="mt-2 text-xs text-slate-500">
              {(r.permissions as string[]).length} permissions · {r.userCount} user{r.userCount === 1 ? '' : 's'}
            </p>
          </Card>
        ))}
      </div>
      {edit && <RoleModal role={edit} all={perms.data ?? []} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RoleModal({ role, all, onClose }: { role: Row; all: { key: string; module: string }[]; onClose: () => void }) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));
  const byModule = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of all) m.set(p.module, [...(m.get(p.module) ?? []), p.key]);
    return [...m.entries()];
  }, [all]);
  const save = useAction(() => (role.id ? put(`/roles/${role.id}`, { name, description, permissions: [...selected] }) : post('/roles', { name, description, permissions: [...selected] })), 'Role saved', onClose);
  const remove = useAction(() => del(`/roles/${role.id}`), 'Role deleted', onClose);
  const toggle = (k: string) => {
    const n = new Set(selected);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setSelected(n);
  };
  return (
    <Modal open onClose={onClose} title={role.id ? `Edit role · ${role.name}` : 'New role'} wide>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={role.isSystem} />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto">
        {byModule.map(([module, keys]) => (
          <div key={module} className="rounded border p-3">
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={keys.every((k) => selected.has(k))}
                onChange={(e) => {
                  const n = new Set(selected);
                  keys.forEach((k) => (e.target.checked ? n.add(k) : n.delete(k)));
                  setSelected(n);
                }}
              />
              {titleCase(module)}
            </label>
            <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
              {keys.map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} />
                  {k.split('.').slice(1).join(' · ')}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between">
        {role.id && !role.isSystem ? (
          <Button variant="danger" onClick={() => confirm('Delete this role?') && remove.mutate()} loading={remove.isPending}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save role
        </Button>
      </div>
    </Modal>
  );
}
