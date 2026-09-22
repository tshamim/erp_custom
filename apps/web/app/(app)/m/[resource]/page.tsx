'use client';

import { notFound, useParams, useSearchParams } from 'next/navigation';
import { ResourceList } from '@/components/resource';
import { RESOURCES } from '@/lib/resources';

export default function ResourceListPage() {
  const { resource } = useParams<{ resource: string }>();
  const search = useSearchParams();
  const def = RESOURCES[resource];
  if (!def) notFound();
  return <ResourceList key={resource} def={def} initialParams={Object.fromEntries(search.entries())} />;
}
