'use client';

import { useQuery } from '@tanstack/react-query';
import { notFound, useParams, useSearchParams } from 'next/navigation';
import { ResourceForm } from '@/components/resource';
import { Loading } from '@/components/ui';
import { get } from '@/lib/api';
import { RESOURCES } from '@/lib/resources';
import type { Row } from '@/lib/resource-types';

/** Prefill a new document from a source document passed in the query string. */
async function prefill(resource: string, params: URLSearchParams): Promise<Row | undefined> {
  const requisitionId = params.get('requisitionId');
  if (resource === 'purchase-orders' && requisitionId) {
    const pr = await get<Row>(`/purchase-requisitions/${requisitionId}`);
    return {
      requisitionId,
      projectId: pr.projectId ?? '',
      warehouseId: pr.warehouseId ?? '',
      lines: (pr.lines as Row[]).map((l) => ({ itemId: l.itemId, description: l.itemName, quantity: String(Number(l.quantity)), unitPrice: l.estimatedRate ?? '', vatCodeId: '' })),
    };
  }
  const projectId = params.get('projectId');
  return projectId ? { projectId } : undefined;
}

export default function ResourceNewPage() {
  const { resource } = useParams<{ resource: string }>();
  const params = useSearchParams();
  const def = RESOURCES[resource];
  const initial = useQuery({ queryKey: ['prefill', resource, params.toString()], queryFn: async () => (await prefill(resource, params)) ?? null });
  if (!def?.form) notFound();
  if (initial.isLoading) return <Loading />;
  return <ResourceForm def={def} initial={initial.data ?? undefined} />;
}
