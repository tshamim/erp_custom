'use client';

import { notFound, useParams } from 'next/navigation';
import { DocumentView, ResourceForm } from '@/components/resource';
import { ErrorBox, Loading } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { RESOURCES } from '@/lib/resources';
import type { Row } from '@/lib/resource-types';

export default function ResourceDetailPage() {
  const { resource, id } = useParams<{ resource: string; id: string }>();
  const def = RESOURCES[resource];
  const q = useGet<Row>(def ? `${def.endpoint}/${id}` : null);
  if (!def) notFound();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (def.detail) return <DocumentView def={def} row={q.data!} />;
  if (def.editable && def.form) return <ResourceForm def={def} id={id} initial={q.data!} />;
  notFound();
}
