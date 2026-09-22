'use client';

import { HardHat } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Button, ErrorBox, Field, Input } from '@/components/ui';
import { API_URL, Profile, setSession, tenantFromHost } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [company, setCompany] = useState('');
  const [fromHost, setFromHost] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = tenantFromHost();
    if (t) {
      setCompany(t);
      setFromHost(true);
    } else {
      try {
        setCompany(localStorage.getItem('erp.lastCompany') ?? '');
      } catch {
        /* ignore */
      }
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const slug = company.trim().toLowerCase();
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-tenant': slug },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Login failed');
      setSession({ scope: 'tenant', tenant: slug, accessToken: body.accessToken, profile: body.profile as Profile });
      try {
        localStorage.setItem('erp.lastCompany', slug);
      } catch {
        /* ignore */
      }
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-700 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-2">
          <div className="rounded-lg bg-brand-600 p-2 text-white">
            <HardHat className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold">BuildERP</div>
            <div className="text-xs text-slate-500">Sign in to your company</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Company ID">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} required disabled={fromHost} placeholder="e.g. acme" autoComplete="organization" />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/platform/login" className="hover:text-slate-600">
            Platform administration →
          </Link>
        </p>
      </div>
    </div>
  );
}
