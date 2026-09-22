const bdt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });

/** Lakh/crore grouping (en-IN), 2 decimals. */
export function money(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? bdt.format(n) : String(v);
}

export function qty(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? qtyFmt.format(n) : String(v);
}

export function date(v: unknown): string {
  if (!v) return '—';
  const s = String(v);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(v: unknown): string {
  if (!v) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => `${today().slice(0, 7)}-01`;

export function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
