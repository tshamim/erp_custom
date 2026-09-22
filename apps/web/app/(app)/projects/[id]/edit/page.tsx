'use client';

import { useParams } from 'next/navigation';
import { ResourceForm } from '@/components/resource';
import { ErrorBox, Loading } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { projectDef } from '@/lib/project-def';
import type { Row } from '@/lib/resource-types';

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const q = useGet<Row>(`/projects/${id}`);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return <ResourceForm def={projectDef} id={id} initial={q.data} />;
}
