'use client';

import { LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Loading } from './ui';
import { getSession, post, setSession } from '@/lib/api';
import { useSession } from '@/lib/hooks';

/** Chrome for platform-owner screens; redirects to the platform login when not signed in. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    // Read storage directly: the hook's first client snapshot is null during hydration.
    if (getSession()?.scope !== 'platform') router.replace('/platform/login');
  }, [session, router]);
  if (!ready || session?.scope !== 'platform') return <Loading />;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <Link href="/platform" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand-500" /> BuildERP Platform
        </Link>
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span className="hidden sm:inline">{session.profile.user.email}</span>
          <button
            className="flex items-center gap-1 hover:text-white"
            onClick={() => {
              void post('/platform/auth/logout').catch(() => undefined);
              setSession(null);
              router.replace('/platform/login');
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </div>
  );
}

export const bytes = (n?: number | null) => {
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};
