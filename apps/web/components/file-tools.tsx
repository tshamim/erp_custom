'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileDown, FileSpreadsheet, FileText, Paperclip, Printer, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, ErrorBox, Modal, Spinner, useToast } from './ui';
import { can, del, fetchFile, get, post, qs, upload } from '@/lib/api';
import { downloadCsvTemplate, exportCsv, exportPdf, parseCsv, PdfSection } from '@/lib/export';
import { dateTime } from '@/lib/format';
import type { ColumnDef, Row } from '@/lib/resource-types';
import { IMPORT_TEMPLATES, type ImportResource } from '@erp/shared';

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Files attached to any record, stored in MinIO. */
export function Attachments({ entity, entityId, title = 'Attachments' }: { entity: string; entityId: string; title?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const key = ['attachments', entity, entityId];
  const q = useQuery({ queryKey: key, queryFn: () => get<Row[]>(`/attachments${qs({ entity, entityId })}`), enabled: can('core.attachment.read') });
  if (!can('core.attachment.read')) return null;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await upload(`/attachments${qs({ entity, entityId })}`, f);
      toast(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete ${r.fileName}?`)) return;
    try {
      await del(`/attachments/${r.id}`);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const previewable = (m?: string) => !!m && (m.startsWith('image/') || m === 'application/pdf' || m === 'text/plain');

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" /> {title} {q.data?.length ? <span className="text-slate-400">({q.data.length})</span> : null}
        </span>
      }
      className="no-print"
      actions={
        can('core.attachment.create') && (
          <>
            <input ref={input} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt,.xls,.xlsx,.doc,.docx,.zip" />
            <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
          </>
        )
      }
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (can('core.attachment.create')) void onFiles(e.dataTransfer.files);
        }}
      >
        {q.isLoading ? (
          <Spinner />
        ) : !q.data?.length ? (
          <p className="rounded border border-dashed py-4 text-center text-sm text-slate-400">No files. Drag &amp; drop here or use Upload (PDF, images, Office, CSV · max 20 MB).</p>
        ) : (
          <ul className="divide-y text-sm">
            {q.data.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{r.fileName}</span>
                <span className="hidden text-xs text-slate-400 sm:inline">
                  {kb(r.size ?? 0)} · {r.uploadedBy ?? '—'} · {dateTime(r.createdAt)}
                </span>
                {previewable(r.mimeType) && (
                  <button title="Preview" className="text-slate-500 hover:text-brand-600" onClick={() => fetchFile(`/attachments/${r.id}/download?inline=1`, r.fileName, true).catch((e) => toast(e.message, 'error'))}>
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                <button title="Download" className="text-slate-500 hover:text-brand-600" onClick={() => fetchFile(`/attachments/${r.id}/download`, r.fileName).catch((e) => toast(e.message, 'error'))}>
                  <Download className="h-4 w-4" />
                </button>
                {can('core.attachment.delete') && (
                  <button title="Delete" className="text-slate-400 hover:text-red-600" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/**
 * CSV / PDF / Print buttons. `load` returns everything to export (lists fetch all pages);
 * `pdf` optionally builds a richer document PDF instead of a plain table.
 */
export function ExportMenu({ title, columns, load, pdf, subtitle }: { title: string; columns: ColumnDef[]; load: () => Promise<Row[]> | Row[]; pdf?: () => Promise<PdfSection[]> | PdfSection[]; subtitle?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'csv' | 'pdf'>(null);
  const run = async (kind: 'csv' | 'pdf') => {
    setBusy(kind);
    try {
      if (kind === 'csv') exportCsv(title, columns, await load());
      else await exportPdf(title, pdf ? await pdf() : [{ table: { columns, rows: await load() } }], subtitle);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="no-print flex gap-1">
      <Button size="sm" variant="secondary" onClick={() => run('csv')} loading={busy === 'csv'} title="Export CSV">
        <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
      </Button>
      <Button size="sm" variant="secondary" onClick={() => run('pdf')} loading={busy === 'pdf'} title="Export PDF">
        <FileDown className="h-3.5 w-3.5" /> PDF
      </Button>
      <Button size="sm" variant="secondary" onClick={() => window.print()} title="Print">
        <Printer className="h-3.5 w-3.5" /> Print
      </Button>
    </div>
  );
}

interface ImportResult {
  total: number;
  valid: number;
  created: number;
  dryRun: boolean;
  errors: { row: number; message: string }[];
}

/** CSV import: download template → pick file → validate (dry run) → import. */
export function ImportDialog({ resource, open, onClose, projectId }: { resource: ImportResource; open: boolean; onClose: () => void; projectId?: string }) {
  const tpl = IMPORT_TEMPLATES[resource];
  const qc = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setRows(null);
      setResult(null);
      setError(null);
      setFileName('');
    }
  }, [open]);

  const send = async (dryRun: boolean) => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<ImportResult>(`/import/${resource}${qs({ dryRun })}`, { rows, projectId });
      setResult(r);
      if (!dryRun && r.created) {
        toast(`${r.created} ${tpl.label.toLowerCase()} imported`);
        await qc.invalidateQueries();
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const missing = rows?.length ? tpl.required.filter((c) => !(c in rows[0])) : [];
  return (
    <Modal open={open} onClose={onClose} title={`Import ${tpl.label}`} wide>
      <div className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          <li>
            Download the{' '}
            <button className="text-brand-600 underline" onClick={() => downloadCsvTemplate(resource, tpl.columns, tpl.example)}>
              CSV template
            </button>{' '}
            (columns: <code className="text-xs">{tpl.columns.join(', ')}</code>; required: {tpl.required.join(', ')}).
          </li>
          <li>Fill it in Excel / Google Sheets and save as CSV (UTF-8).</li>
          <li>Upload, validate, then import. The import is all-or-nothing — fix every error first.</li>
        </ol>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 p-6 text-slate-500 hover:border-brand-500">
          <Upload className="h-5 w-5" />
          {fileName || 'Choose CSV file'}
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setResult(null);
              setError(null);
              setFileName(f.name);
              try {
                setRows(await parseCsv(f));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        {rows && (
          <p>
            <b>{rows.length}</b> rows read.
            {missing.length > 0 && <span className="text-red-600"> Missing required columns: {missing.join(', ')}</span>}
          </p>
        )}
        <ErrorBox error={error} />
        {result && (
          <div className={`rounded border p-3 ${result.errors.length ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="font-medium">
              {result.errors.length ? `${result.errors.length} row(s) need fixing` : `All ${result.valid} rows are valid`}
              {result.created ? ` · ${result.created} imported` : ''}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-red-700">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Line {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={!rows?.length || missing.length > 0} loading={busy && !result} onClick={() => send(true)}>
            Validate
          </Button>
          <Button disabled={!rows?.length || missing.length > 0 || !!result?.errors.length || !result} loading={busy && !!result} onClick={() => send(false)}>
            Import {rows?.length ?? ''} rows
          </Button>
        </div>
      </div>
    </Modal>
  );
}
