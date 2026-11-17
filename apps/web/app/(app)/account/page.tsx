'use client';

import { FormEvent, useState } from 'react';
import { Button, Card, ErrorBox, Field, Input, PageHeader, useToast } from '@/components/ui';
import { getSession, post, setSession } from '@/lib/api';

/** The signed-in user changes their own password. Other devices are signed out; this one stays in. */
export default function AccountPage() {
  const session = getSession();
  const toast = useToast();
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = v.confirm !== '' && v.next !== v.confirm;
  const tooShort = v.next !== '' && v.next.length < 8;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ accessToken: string }>('/auth/password', { currentPassword: v.current, newPassword: v.next });
      const s = getSession();
      if (s) setSession({ ...s, accessToken: res.accessToken });
      setV({ current: '', next: '', confirm: '' });
      toast('Password changed. Other devices have been signed out.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="My account" subtitle={session ? `${session.profile.user.name} · ${session.profile.user.email}` : undefined} />
      <Card title="Change password">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} required />
          </Field>
          <Field label="New password" hint="At least 8 characters." error={tooShort ? 'At least 8 characters' : undefined}>
            <Input type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} required />
          </Field>
          <Field label="Repeat new password" error={mismatch ? 'The two passwords do not match' : undefined}>
            <Input type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} required />
          </Field>
          <ErrorBox error={error} />
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!v.current || !v.next || mismatch || tooShort}>
              Change password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
