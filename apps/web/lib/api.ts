'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';

export interface Profile {
  user: { id: string; name: string; email: string };
  roles?: string[];
  permissions?: string[];
  modules?: string[];
  tenant?: { id: string; slug: string; name: string };
  /** Platform admin email when this is a "login as tenant" session. */
  impersonatedBy?: string | null;
}

export interface Session {
  scope: 'tenant' | 'platform';
  tenant?: string;
  accessToken: string;
  profile: Profile;
}

const KEY = 'erp.session';
let memory: Session | null = null;
const listeners = new Set<() => void>();

const PLATFORM_KEY = 'erp.platformSession';

/** While impersonating, the platform session is parked here so the owner can return to it. */
export function parkPlatformSession(s: Session) {
  try {
    localStorage.setItem(PLATFORM_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function restorePlatformSession(): boolean {
  try {
    const raw = localStorage.getItem(PLATFORM_KEY);
    localStorage.removeItem(PLATFORM_KEY);
    if (!raw) return false;
    setSession(JSON.parse(raw) as Session);
    return true;
  } catch {
    return false;
  }
}

export function getSession(): Session | null {
  if (memory) return memory;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function setSession(s: Session | null) {
  memory = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — session stays in memory */
  }
  listeners.forEach((l) => l());
}

export function onSessionChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Company slug from subdomain: acme.localhost:3100 → acme */
export function tenantFromHost(): string | null {
  if (typeof window === 'undefined') return null;
  const labels = window.location.hostname.split('.');
  if (labels.length < 2 || /^\d+$/.test(labels[0])) return null;
  return ['www', 'app', 'localhost', 'platform'].includes(labels[0]) ? null : labels[0];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as { message?: string | string[]; errors?: { path: string; message: string }[]; detail?: string };
    if (b.errors?.length) return b.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ');
    if (Array.isArray(b.message)) return b.message.join('; ');
    if (b.message) return b.detail ? `${b.message} (${b.detail})` : b.message;
  }
  return `Request failed (${status})`;
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const s = getSession();
  if (!s) return false;
  const url = s.scope === 'platform' ? '/platform/auth/refresh' : '/auth/refresh';
  const res = await fetch(API_URL + url, {
    method: 'POST',
    credentials: 'include',
    headers: s.tenant ? { 'x-tenant': s.tenant } : {},
  });
  if (!res.ok) return false;
  const { accessToken } = await res.json();
  setSession({ ...s, accessToken });
  return true;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const s = getSession();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (s?.accessToken) headers.authorization = `Bearer ${s.accessToken}`;
  if (s?.tenant) headers['x-tenant'] = s.tenant;
  let body = init.body;
  if (init.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const res = await fetch(API_URL + path, { ...init, headers, body, credentials: 'include' });
  if (res.status === 401 && retry && s) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    if (await refreshing) return api<T>(path, init, false);
    setSession(null);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status), data);
  return data as T;
}

export const get = <T = unknown>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const put = <T = unknown>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json });
export const patch = <T = unknown>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });

/** Multipart upload of a single file (field "file"). */
export function upload<T = unknown>(path: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return api<T>(path, { method: 'POST', body });
}

/** Authenticated binary download → opens in a new tab (inline) or saves the file. */
export async function fetchFile(path: string, filename: string, inline = false, retry = true): Promise<void> {
  const s = getSession();
  const headers: Record<string, string> = {};
  if (s?.accessToken) headers.authorization = `Bearer ${s.accessToken}`;
  if (s?.tenant) headers['x-tenant'] = s.tenant;
  const res = await fetch(API_URL + path, { headers, credentials: 'include' });
  if (res.status === 401 && retry && (await refresh())) return fetchFile(path, filename, inline, false);
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`, null);
  const url = URL.createObjectURL(await res.blob());
  if (inline) window.open(url, '_blank', 'noopener');
  else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function can(perm?: string): boolean {
  if (!perm) return true;
  const perms = getSession()?.profile.permissions ?? [];
  return perms.includes(perm);
}
