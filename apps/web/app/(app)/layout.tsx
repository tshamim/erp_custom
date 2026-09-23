'use client';

import { ChevronDown, HardHat, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, Suspense, useEffect, useState } from 'react';
import { cn, Loading } from '@/components/ui';
import { getSession, post, restorePlatformSession, setSession } from '@/lib/api';
import { useSession } from '@/lib/hooks';
import { NAV } from '@/lib/nav';

export default function AppLayout({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    // Read storage directly: the hook's first client snapshot is null during hydration.
    if (mounted && getSession()?.scope !== 'tenant') router.replace('/login');
  }, [mounted, session, router]);
  useEffect(() => setMobileOpen(false), [pathname]);

  if (!mounted || session?.scope !== 'tenant') return <Loading />;
  const perms = new Set(session.profile.permissions ?? []);
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  const logout = async () => {
    await post('/auth/logout').catch(() => undefined);
    setSession(null);
    router.replace('/login');
  };

  const sidebar = (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2 px-4 py-4 text-white">
        <div className="rounded-md bg-brand-600 p-1.5">
          <HardHat className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{session.profile.tenant?.name}</div>
          <div className="text-[11px] text-slate-400">BuildERP</div>
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {NAV.map((section) => {
          const items = section.items.filter((i) => !i.perm || perms.has(i.perm));
          if (!items.length) return null;
          const Icon = section.icon;
          const open = !collapsed[section.label];
          return (
            <div key={section.label}>
              <button
                onClick={() => setCollapsed({ ...collapsed, [section.label]: open })}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronDown className={cn('h-3 w-3 transition', !open && '-rotate-90')} />
              </button>
              {open &&
                items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={cn(
                      'block rounded-md py-1.5 pl-8 pr-2 text-sm',
                      isActive(i.href) ? 'bg-slate-800 font-medium text-white' : 'hover:bg-slate-800/60 hover:text-white',
                    )}
                  >
                    {i.label}
                  </Link>
                ))}
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-800 px-4 py-3">
        <div className="truncate text-sm text-white">{session.profile.user.name}</div>
        <div className="truncate text-xs text-slate-500">{session.profile.roles?.join(', ')}</div>
        <button onClick={logout} className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-white">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 w-64" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1 lg:pl-60">
        {session.profile.impersonatedBy && (
          <div className="no-print flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-medium text-white">
            <span>
              Platform support session — signed in as {session.profile.user.name} ({session.profile.user.email}) by {session.profile.impersonatedBy}. Everything you do is audited.
            </span>
            <button
              className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30"
              onClick={() => {
                setSession(null);
                if (restorePlatformSession()) router.replace('/platform');
                else router.replace('/platform/login');
              }}
            >
              Exit to platform
            </button>
          </div>
        )}
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b bg-white px-4 py-2.5 lg:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">{session.profile.tenant?.name}</span>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-6">
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
