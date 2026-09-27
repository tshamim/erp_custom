'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, Field, Loading, PageHeader, Select, Stat } from '@/components/ui';
import { fetchBlobUrl } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { dateTime, titleCase } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

/** Where images live: site progress photographs, scanned certificates, signed challans. */
const ENTITIES = [
  'company_document',
  'project',
  'daily_progress_report',
  'goods_receipt',
  'ra_bill',
  'employee',
  'investor',
  'eb3_candidate',
  'eb3_case',
  'quotation',
];

export default function GalleryPage() {
  const [entity, setEntity] = useState('');
  const q = useGet<Row[]>(`/company-documents/gallery${entity ? `?entity=${entity}` : ''}`);
  const images = q.data ?? [];
  const totalSize = images.reduce((a, r) => a + Number(r.size ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Media gallery"
        subtitle="Every image uploaded anywhere in the system, newest first."
        actions={
          <Link href="/m/company-documents" className="self-center text-sm text-brand-600 hover:underline">
            Company documents →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Images" value={images.length} />
        <Stat label="Total size" value={`${(totalSize / 1024 / 1024).toFixed(1)} MB`} />
        <Stat label="Filter" value={entity ? titleCase(entity) : 'Everything'} />
      </div>

      <Card className="mt-4">
        <Field label="Attached to">
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="max-w-sm">
            <option value="">Everything</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {titleCase(e)}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} />}
      {q.data && images.length === 0 && <p className="mt-4 text-sm text-slate-500">No images yet. Attach photographs or scans to any record and they appear here.</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {images.map((img) => (
          <Thumb key={img.id as string} img={img} />
        ))}
      </div>
    </div>
  );
}

/** Attachments are behind the API's auth, so the thumbnail is fetched as a blob. */
function Thumb({ img }: { img: Row }) {
  const src = useQuery({
    queryKey: ['thumb', img.id],
    queryFn: () => fetchBlobUrl(`/attachments/${img.id}/download?inline=1`),
    staleTime: 5 * 60_000,
  });
  return (
    <button
      type="button"
      onClick={() => src.data && window.open(src.data, '_blank', 'noopener')}
      className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm"
    >
      <div className="flex h-36 w-full items-center justify-center bg-slate-100">
        {src.data ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src.data} alt={img.fileName as string} className="h-36 w-full object-cover transition group-hover:opacity-90" />
        ) : (
          <span className="text-xs text-slate-400">{src.isError ? 'Could not load' : 'Loading…'}</span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium text-slate-700">{img.fileName as string}</p>
        <p className="truncate text-[11px] text-slate-500">
          {titleCase((img.entity as string) ?? '')} · {dateTime(img.createdAt)}
        </p>
        {img.uploadedBy ? <p className="truncate text-[11px] text-slate-400">{img.uploadedBy as string}</p> : null}
      </div>
    </button>
  );
}
