'use client';

import { Lock, Unlock } from 'lucide-react';
import { Badge, Button, Card, Loading, PageHeader } from '@/components/ui';
import { can, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function FiscalPage() {
  const q = useGet<Row[]>('/fiscal-years');
  const next = useAction(() => post('/fiscal-years'), 'Next fiscal year created');
  const lock = useAction(({ id, locked }: { id: string; locked: boolean }) => post(`/fiscal-years/periods/${id}/${locked ? 'unlock' : 'lock'}`), 'Period updated');
  if (q.isLoading) return <Loading />;
  return (
    <div>
      <PageHeader
        title="Fiscal years & periods"
        subtitle="Bangladesh fiscal year runs July to June. Lock a month once it is closed — no postings can be dated in it."
        actions={
          can('finance.fiscal.create') && (
            <Button onClick={() => next.mutate()} loading={next.isPending}>
              Create next fiscal year
            </Button>
          )
        }
      />
      <div className="space-y-4">
        {q.data?.map((fy) => (
          <Card key={fy.id} title={`${fy.name} · ${date(fy.startDate)} – ${date(fy.endDate)}`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {(fy.periods as Row[]).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{p.name}</span>
                  {can('finance.fiscal.update') ? (
                    <button onClick={() => lock.mutate({ id: p.id, locked: p.isLocked })} title={p.isLocked ? 'Unlock' : 'Lock'} className={p.isLocked ? 'text-red-600' : 'text-slate-400 hover:text-slate-700'}>
                      {p.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                  ) : (
                    <Badge value={p.isLocked ? 'locked' : 'active'} />
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
