'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOptions } from '@/components/resource';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select } from '@/components/ui';
import { post, qs } from '@/lib/api';
import { useAction, useGet, useLookups } from '@/lib/hooks';
import { money, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

export default function NewPaymentPage() {
  const router = useRouter();
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [partyId, setPartyId] = useState('');
  const [v, setV] = useState({ date: today(), cashAccountId: '', method: 'bank_transfer', chequeNo: '', reference: '', amount: '', tdsCodeId: '', vdsCodeId: '', tdsAmount: '', vdsAmount: '', notes: '' });
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const lookups = useLookups(['accounts', 'taxCodes']);
  const parties = useOptions({ endpoint: '/parties?pageSize=200', label: (r) => `${r.name} (${r.type})` });
  const docs = useGet<Row[]>(partyId ? `/payments/open-documents${qs({ partyId, direction })}` : null);
  useEffect(() => setAlloc({}), [partyId, direction]);
  useEffect(() => {
    const p = parties.rows.find((r) => r.id === partyId);
    if (p) setDirection(p.type === 'customer' ? 'in' : 'out');
  }, [partyId, parties.rows]);

  const taxes = lookups.data?.taxCodes ?? [];
  const rate = (id: string) => Number(taxes.find((t) => t.id === id)?.rate ?? 0);
  const gross = Number(v.amount || 0);
  const tds = v.tdsAmount !== '' ? Number(v.tdsAmount) : v.tdsCodeId ? (gross * rate(v.tdsCodeId)) / 100 : 0;
  const vds = v.vdsAmount !== '' ? Number(v.vdsAmount) : v.vdsCodeId ? (gross * rate(v.vdsCodeId)) / 100 : 0;
  const allocated = Object.values(alloc).reduce((a, x) => a + Number(x || 0), 0);

  const save = useAction(
    () =>
      post<Row>('/payments', {
        direction,
        partyId,
        date: v.date,
        cashAccountId: v.cashAccountId,
        method: v.method,
        chequeNo: v.chequeNo || null,
        reference: v.reference || null,
        amount: v.amount,
        tdsCodeId: v.tdsCodeId || null,
        vdsCodeId: v.vdsCodeId || null,
        tdsAmount: v.tdsAmount !== '' ? v.tdsAmount : null,
        vdsAmount: v.vdsAmount !== '' ? v.vdsAmount : null,
        notes: v.notes || null,
        allocations: Object.entries(alloc)
          .filter(([, a]) => Number(a) > 0)
          .map(([id, amount]) => (direction === 'in' ? { invoiceId: id, amount } : { billId: id, amount })),
      }),
    direction === 'in' ? 'Receipt posted' : 'Payment posted',
    (r) => router.push(`/m/payments/${r.id}`),
  );
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const autoAllocate = () => {
    let left = gross;
    const next: Record<string, string> = {};
    for (const d of docs.data ?? []) {
      const take = Math.min(left, Number(d.outstanding));
      if (take > 0) next[d.id] = take.toFixed(2);
      left -= take;
    }
    setAlloc(next);
  };

  return (
    <div>
      <PageHeader title={direction === 'in' ? 'New receipt from customer' : 'New payment to vendor'} subtitle="Withholding (TDS/VDS) is deducted from the gross and posted to the tax payable/receivable accounts." />
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Type">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
              <option value="out">Payment (money out)</option>
              <option value="in">Receipt (money in)</option>
            </Select>
          </Field>
          <Field label="Party *" className="md:col-span-2">
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">— Select —</option>
              {parties.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={v.date} onChange={set('date')} />
          </Field>
          <Field label="Cash / bank account *">
            <Select value={v.cashAccountId} onChange={set('cashAccountId')}>
              <option value="">— Select —</option>
              {lookups.data?.accounts
                ?.filter((a) => ['cash', 'bank'].includes(String(a.subtype)))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Method">
            <Select value={v.method} onChange={set('method')}>
              <option value="bank_transfer">Bank transfer / EFT</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="mobile_banking">Mobile banking (bKash/Nagad)</option>
            </Select>
          </Field>
          {v.method === 'cheque' && (
            <Field label="Cheque no.">
              <Input value={v.chequeNo} onChange={set('chequeNo')} />
            </Field>
          )}
          <Field label="Reference">
            <Input value={v.reference} onChange={set('reference')} />
          </Field>
          <Field label="Gross amount *">
            <Input className="text-right" value={v.amount} onChange={set('amount')} />
          </Field>
          <Field label="TDS code">
            <Select value={v.tdsCodeId} onChange={set('tdsCodeId')}>
              <option value="">None</option>
              {taxes
                .filter((t) => t.kind === 'tds')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Number(t.rate)}%)
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="TDS amount" hint="Blank = rate × gross">
            <Input className="text-right" value={v.tdsAmount} onChange={set('tdsAmount')} placeholder={tds.toFixed(2)} />
          </Field>
          <Field label="VDS code">
            <Select value={v.vdsCodeId} onChange={set('vdsCodeId')}>
              <option value="">None</option>
              {taxes
                .filter((t) => t.kind === 'vds')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Number(t.rate)}%)
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="VDS amount" hint="Blank = rate × gross">
            <Input className="text-right" value={v.vdsAmount} onChange={set('vdsAmount')} placeholder={vds.toFixed(2)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-6 text-sm">
          <span>
            TDS <b className="num">{money(tds)}</b>
          </span>
          <span>
            VDS <b className="num">{money(vds)}</b>
          </span>
          <span>
            Net {direction === 'in' ? 'received' : 'paid'} <b className="num">{money(gross - tds - vds)}</b>
          </span>
        </div>
      </Card>
      {partyId && (
        <Card
          title={`Allocate against open ${direction === 'in' ? 'invoices' : 'bills'}`}
          className="mt-4"
          actions={
            <Button size="sm" variant="secondary" onClick={autoAllocate} disabled={!gross}>
              Auto-allocate oldest first
            </Button>
          }
        >
          {docs.isLoading ? (
            <Loading />
          ) : !docs.data?.length ? (
            <p className="text-sm text-slate-500">No open documents — the amount will be posted on account.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2">Document</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2 text-right">Total</th>
                  <th className="pb-2 text-right">Outstanding</th>
                  <th className="w-40 pb-2 text-right">Allocate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {docs.data.map((d) => (
                  <tr key={d.id}>
                    <td className="py-1.5">{d.no}</td>
                    <td>{d.date}</td>
                    <td className="num text-right">{money(d.total)}</td>
                    <td className="num text-right">{money(d.outstanding)}</td>
                    <td>
                      <Input className="text-right" value={alloc[d.id] ?? ''} onChange={(e) => setAlloc({ ...alloc, [d.id]: e.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className={`mt-2 text-right text-sm ${allocated > gross ? 'text-red-600' : 'text-slate-500'}`}>
            Allocated {money(allocated)} of {money(gross)}
          </p>
        </Card>
      )}
      <div className="mt-4 space-y-2">
        <ErrorBox error={save.error} />
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!partyId || !v.cashAccountId || !gross}>
            Post {direction === 'in' ? 'receipt' : 'payment'}
          </Button>
        </div>
      </div>
    </div>
  );
}
