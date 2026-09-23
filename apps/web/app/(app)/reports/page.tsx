'use client';

import { Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { DataTable } from '@/components/resource';
import { ExportMenu } from '@/components/file-tools';
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat, Tabs } from '@/components/ui';
import { qs } from '@/lib/api';
import { useGet, useLookups } from '@/lib/hooks';
import { money, monthStart, today } from '@/lib/format';
import type { Row } from '@/lib/resource-types';

const TABS = [
  { key: 'tb', label: 'Trial Balance' },
  { key: 'pl', label: 'Profit & Loss' },
  { key: 'bs', label: 'Balance Sheet' },
  { key: 'gl', label: 'General Ledger' },
  { key: 'ar', label: 'Receivable Aging' },
  { key: 'ap', label: 'Payable Aging' },
  { key: 'tax', label: 'VAT & TDS' },
  { key: 'stock', label: 'Stock Valuation' },
];

export default function ReportsPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'tb');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [projectId, setProjectId] = useState('');
  const [accountId, setAccountId] = useState(params.get('accountId') ?? '');
  const lookups = useLookups(['projects', 'accounts']);
  const needsRange = ['pl', 'gl', 'tax'].includes(tab);
  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        }
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        {needsRange && (
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        )}
        <Field label={needsRange ? 'To' : 'As of'}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {tab === 'pl' && (
          <Field label="Project (cost center)">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-64">
              <option value="">Whole company</option>
              {lookups.data?.projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {tab === 'gl' && (
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-80">
              <option value="">— Select account —</option>
              {lookups.data?.accounts
                ?.filter((a) => !a.isGroup)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
      </div>
      {tab === 'tb' && <TrialBalance asOf={to} />}
      {tab === 'pl' && <ProfitLoss from={from} to={to} projectId={projectId} />}
      {tab === 'bs' && <BalanceSheet asOf={to} />}
      {tab === 'gl' && (accountId ? <Ledger accountId={accountId} from={from} to={to} /> : <p className="text-sm text-slate-500">Choose an account.</p>)}
      {(tab === 'ar' || tab === 'ap') && <Aging kind={tab} asOf={to} />}
      {tab === 'tax' && <Tax from={from} to={to} />}
      {tab === 'stock' && <StockValuation />}
    </div>
  );
}

function useReport<T = Row>(path: string) {
  return useGet<T>(path);
}

function Wrap({ q, children }: { q: { isLoading: boolean; error: unknown }; children: () => ReactNode }) {
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return <>{children()}</>;
}

function BalancedFlag({ ok }: { ok: boolean }) {
  return <span className={`text-xs font-medium ${ok ? 'text-emerald-700' : 'text-red-600'}`}>{ok ? '✔ Balanced' : '✘ Not balanced'}</span>;
}

const TB_COLUMNS = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Account' },
  { key: 'debit', label: 'Debit', format: 'money' as const },
  { key: 'credit', label: 'Credit', format: 'money' as const },
];

function TrialBalance({ asOf }: { asOf: string }) {
  const q = useReport(`/reports/trial-balance${qs({ asOf })}`);
  return (
    <Wrap q={q}>
      {() => (
        <Card
          title={<>Trial balance as of {asOf} · <BalancedFlag ok={q.data!.balanced} /></>}
          actions={<ExportMenu title={`Trial balance ${asOf}`} columns={TB_COLUMNS} load={() => q.data!.rows as Row[]} />}
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Code</th>
                <th className="pb-2">Account</th>
                <th className="pb-2 text-right">Debit</th>
                <th className="pb-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(q.data!.rows as Row[]).map((r) => (
                <tr key={r.id}>
                  <td className="py-1">{r.code}</td>
                  <td>{r.name}</td>
                  <td className="num text-right">{Number(r.debit) ? money(r.debit) : ''}</td>
                  <td className="num text-right">{Number(r.credit) ? money(r.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr className="border-t-2">
                <td colSpan={2} className="py-2">
                  Total
                </td>
                <td className="num text-right">{money(q.data!.totalDebit)}</td>
                <td className="num text-right">{money(q.data!.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </Wrap>
  );
}

function Section({ title, rows, total }: { title: string; rows: Row[]; total: string }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.code + r.name}>
              <td className="w-20 py-0.5 text-slate-500">{r.code}</td>
              <td>{r.name}</td>
              <td className="num text-right">{money(r.amount)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td colSpan={2} className="py-1">
              Total {title.toLowerCase()}
            </td>
            <td className="num text-right">{money(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ProfitLoss({ from, to, projectId }: { from: string; to: string; projectId: string }) {
  const q = useReport(`/reports/profit-loss${qs({ from, to, projectId })}`);
  return (
    <Wrap q={q}>
      {() => {
        const d = q.data!;
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card
              title={`Profit & loss · ${from} to ${to}`}
              className="lg:col-span-2"
              actions={
                <ExportMenu
                  title={`Profit and loss ${from} to ${to}`}
                  columns={PL_COLUMNS}
                  load={() => [...(d.income as Row[]).map((r) => ({ ...r, section: 'Income' })), ...(d.expense as Row[]).map((r) => ({ ...r, section: 'Expense' }))]}
                />
              }
            >
              <Section title="Income" rows={d.income} total={d.totalIncome} />
              <Section title="Expenses" rows={d.expense} total={d.totalExpense} />
              <div className="flex justify-between border-t-2 pt-2 text-base font-semibold">
                <span>Net profit / (loss)</span>
                <span className={`num ${Number(d.netProfit) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(d.netProfit)}</span>
              </div>
            </Card>
            <div className="space-y-3">
              <Stat label="Income" value={money(d.totalIncome)} />
              <Stat label="Gross profit (after direct costs)" value={money(d.grossProfit)} />
              <Stat label="Net profit" value={money(d.netProfit)} tone={Number(d.netProfit) < 0 ? 'bad' : 'good'} />
            </div>
          </div>
        );
      }}
    </Wrap>
  );
}

const PL_COLUMNS = [
  { key: 'section', label: 'Section' },
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Account' },
  { key: 'amount', label: 'Amount', format: 'money' as const },
];

function BalanceSheet({ asOf }: { asOf: string }) {
  const q = useReport(`/reports/balance-sheet${qs({ asOf })}`);
  return (
    <Wrap q={q}>
      {() => {
        const d = q.data!;
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={<>Assets · <BalancedFlag ok={d.balanced} /></>}
              actions={
                <ExportMenu
                  title={`Balance sheet ${asOf}`}
                  columns={PL_COLUMNS}
                  load={() => [
                    ...(d.assets as Row[]).map((r) => ({ ...r, section: 'Assets' })),
                    ...(d.liabilities as Row[]).map((r) => ({ ...r, section: 'Liabilities' })),
                    ...(d.equity as Row[]).map((r) => ({ ...r, section: 'Equity' })),
                  ]}
                />
              }
            >
              <Section title="Assets" rows={d.assets} total={d.totalAssets} />
            </Card>
            <Card title="Liabilities & equity">
              <Section title="Liabilities" rows={d.liabilities} total={d.totalLiabilities} />
              <Section title="Equity" rows={d.equity} total={d.totalEquity} />
              <div className="flex justify-between border-t-2 pt-2 font-semibold">
                <span>Total liabilities & equity</span>
                <span className="num">{money(Number(d.totalLiabilities) + Number(d.totalEquity))}</span>
              </div>
            </Card>
          </div>
        );
      }}
    </Wrap>
  );
}

function Ledger({ accountId, from, to }: { accountId: string; from: string; to: string }) {
  const q = useReport(`/reports/general-ledger/${accountId}${qs({ from, to })}`);
  return (
    <Wrap q={q}>
      {() => (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <b>
              {q.data!.account.code} — {q.data!.account.name}
            </b>
            <span className="flex items-center gap-3">
              Opening <b className="num">{money(q.data!.opening)}</b> · Closing <b className="num">{money(q.data!.closing)}</b>
              <ExportMenu title={`Ledger ${q.data!.account.code} ${from} to ${to}`} columns={GL_COLUMNS} load={() => q.data!.lines as Row[]} />
            </span>
          </div>
          <DataTable rows={q.data!.lines} rowHref={(r) => `/m/journals/${r.entryId}`} columns={GL_COLUMNS} />
        </div>
      )}
    </Wrap>
  );
}

const GL_COLUMNS = [
  { key: 'date', label: 'Date', format: 'date' as const },
  { key: 'no', label: 'Entry' },
  { key: 'sourceType', label: 'Source', format: 'status' as const },
  { key: 'narration', label: 'Narration', render: (r: Row) => r.description || r.narration },
  { key: 'partyName', label: 'Party' },
  { key: 'projectName', label: 'Project' },
  { key: 'debit', label: 'Debit', format: 'money' as const },
  { key: 'credit', label: 'Credit', format: 'money' as const },
  { key: 'balance', label: 'Balance', format: 'money' as const },
];

function Aging({ kind, asOf }: { kind: 'ar' | 'ap'; asOf: string }) {
  const q = useReport(`/reports/aging/${kind}${qs({ asOf })}`);
  return (
    <Wrap q={q}>
      {() => {
        const columns = [
          { key: 'partyName', label: kind === 'ar' ? 'Customer' : 'Vendor' },
          ...(q.data!.buckets as string[]).map((b) => ({ key: b, label: b === 'current' ? 'Not due' : `${b} days`, format: 'money' as const })),
          { key: 'total', label: 'Total', format: 'money' as const },
        ];
        return (
          <div>
            <div className="mb-2 flex justify-end">
              <ExportMenu title={`${kind === 'ar' ? 'Receivable' : 'Payable'} aging ${asOf}`} columns={columns} load={() => q.data!.parties as Row[]} />
            </div>
            <DataTable rows={q.data!.parties} empty="Nothing outstanding" columns={columns} />
          </div>
        );
      }}
    </Wrap>
  );
}

function Tax({ from, to }: { from: string; to: string }) {
  const q = useReport(`/reports/tax-summary${qs({ from, to })}`);
  return (
    <Wrap q={q}>
      {() => {
        const d = q.data!;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Output VAT (sales)" value={money(d.vat.outputVat)} sub={`on ${money(d.vat.outputBase)}`} />
              <Stat label="Input VAT (purchases)" value={money(d.vat.inputVat)} sub={`on ${money(d.vat.inputBase)}`} />
              <Stat label="Net VAT payable" value={money(d.vat.netPayable)} tone={Number(d.vat.netPayable) > 0 ? 'bad' : 'good'} />
              <Stat label="VDS deducted by clients" value={money(d.vdsDeductedByClients)} />
              <Stat label="TDS deducted from vendors" value={money(d.tdsDeductedFromVendors)} />
              <Stat label="VDS deducted from vendors" value={money(d.vdsDeductedFromVendors)} />
              <Stat label="TDS on salary" value={money(d.tdsOnSalary)} />
              <Stat label="AIT deducted by clients" value={money(d.aitDeductedByClients)} />
            </div>
            <Card
              title="Withholding register (for challan / return preparation)"
              actions={<ExportMenu title={`Withholding register ${from} to ${to}`} columns={WITHHOLDING_COLUMNS} load={() => d.withholding as Row[]} />}
            >
              <DataTable
                rows={d.withholding}
                columns={[
                  { key: 'date', label: 'Date', format: 'date' },
                  { key: 'no', label: 'Voucher' },
                  { key: 'direction', label: 'Type', render: (r) => (r.direction === 'out' ? 'Deducted by us' : 'Deducted by client') },
                  { key: 'partyName', label: 'Party' },
                  { key: 'partyTin', label: 'TIN' },
                  { key: 'partyBin', label: 'BIN' },
                  { key: 'amount', label: 'Gross', format: 'money' },
                  { key: 'tdsAmount', label: 'TDS', format: 'money' },
                  { key: 'vdsAmount', label: 'VDS', format: 'money' },
                ]}
              />
            </Card>
          </div>
        );
      }}
    </Wrap>
  );
}

const WITHHOLDING_COLUMNS = [
  { key: 'date', label: 'Date', format: 'date' as const },
  { key: 'no', label: 'Voucher' },
  { key: 'direction', label: 'Type' },
  { key: 'partyName', label: 'Party' },
  { key: 'partyTin', label: 'TIN' },
  { key: 'partyBin', label: 'BIN' },
  { key: 'amount', label: 'Gross', format: 'money' as const },
  { key: 'tdsAmount', label: 'TDS', format: 'money' as const },
  { key: 'vdsAmount', label: 'VDS', format: 'money' as const },
];

const STOCK_VALUATION_COLUMNS = [
  { key: 'itemCode', label: 'Code' },
  { key: 'itemName', label: 'Item' },
  { key: 'category', label: 'Category' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'quantity', label: 'Qty', format: 'qty' as const },
  { key: 'uom', label: 'Unit' },
  { key: 'avgCost', label: 'Avg cost', format: 'money' as const },
  { key: 'value', label: 'Value', format: 'money' as const },
];

function StockValuation() {
  const q = useReport('/reports/stock-valuation');
  return (
    <Wrap q={q}>
      {() => (
        <div>
          <div className="mb-2 flex items-center justify-end gap-3 text-sm">
            <span>
              Total value <b className="num">{money(q.data!.totalValue)}</b>
            </span>
            <ExportMenu title="Stock valuation" columns={STOCK_VALUATION_COLUMNS} load={() => q.data!.rows as Row[]} />
          </div>
          <DataTable rows={q.data!.rows} columns={STOCK_VALUATION_COLUMNS} />
        </div>
      )}
    </Wrap>
  );
}
