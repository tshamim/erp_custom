/**
 * End-to-end business flow against a freshly provisioned tenant database.
 * Requires docker compose services and `pnpm db:migrate:control` to have run.
 */
import '../src/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/db-exception.filter';

const slug = `e2e_${Date.now().toString(36)}`;
const today = new Date().toISOString().slice(0, 10);

describe('ERP flow (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token = '';
  const ids: Record<string, string> = {};

  const api = (method: 'get' | 'post' | 'put' | 'patch', url: string, body?: object) => {
    const r = http[method](url).set('x-tenant', slug).set('authorization', `Bearer ${token}`);
    return body ? r.send(body) : r;
  };
  const ok = async (method: 'get' | 'post' | 'put' | 'patch', url: string, body?: object) => {
    const res = await api(method, url, body);
    if (res.status >= 300) throw new Error(`${method.toUpperCase()} ${url} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    const p = await http.post('/platform/auth/login').send({ email: process.env.PLATFORM_ADMIN_EMAIL, password: process.env.PLATFORM_ADMIN_PASSWORD });
    expect(p.status).toBe(200);
    const created = await http
      .post('/platform/tenants')
      .set('authorization', `Bearer ${p.body.accessToken}`)
      .send({ slug, name: 'E2E Construction', adminName: 'E2E Admin', adminEmail: 'admin@e2e.test', adminPassword: 'E2e@12345' });
    expect(created.status).toBe(201);
    for (let i = 0; i < 60; i++) {
      const s = await http.get(`/platform/tenants/${created.body.id}`).set('authorization', `Bearer ${p.body.accessToken}`);
      if (s.body.status === 'active') break;
      if (s.body.status === 'failed') throw new Error(JSON.stringify(s.body.jobs));
      await new Promise((r) => setTimeout(r, 500));
    }
    const login = await http.post('/auth/login').set('x-tenant', slug).send({ email: 'admin@e2e.test', password: 'E2e@12345' });
    expect(login.status).toBe(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sets up masters', async () => {
    const lk = await ok('get', '/lookups');
    const find = (arr: { id: string; code: string }[], code: string) => arr.find((x) => x.code === code)!;
    ids.bag = find(lk.uoms, 'bag').id;
    ids.cem = find(lk.itemCategories, 'CEM').id;
    ids.central = find(lk.warehouses, 'CS').id;
    ids.vat15 = find(lk.taxCodes, 'VAT-15').id;
    ids.tdsSupply = find(lk.taxCodes, 'TDS-SUPPLY').id;
    ids.tdsContract = find(lk.taxCodes, 'TDS-CONTRACT').id;
    ids.vds75 = find(lk.taxCodes, 'VDS-7.5').id;
    ids.bank = find(lk.accounts, '1121').id;
    ids.clientAdvance = find(lk.accounts, '2180').id;

    ids.client = (await ok('post', '/parties', { type: 'customer', name: 'Roads & Highways Dept' })).id;
    ids.vendor = (await ok('post', '/parties', { type: 'vendor', name: 'Shah Cement Ltd' })).id;
    ids.sub = (await ok('post', '/parties', { type: 'subcontractor', name: 'Karim Masonry Works' })).id;
    ids.item = (await ok('post', '/items', { code: 'CEM-OPC', name: 'OPC Cement 50kg', uomId: ids.bag, categoryId: ids.cem, reorderLevel: '50' })).id;

    const project = await ok('post', '/projects', {
      code: 'P001', name: 'Bridge Approach Road', clientId: ids.client, contractValue: '50000000',
      retentionPercent: '10', vatPercent: '7.5', mobilizationAdvance: '1000000', advanceRecoveryPercent: '10', status: 'active',
    });
    ids.project = project.id;
    ids.siteStore = project.warehouses[0].id;
    await ok('put', `/projects/${ids.project}/budgets`, { budgets: [{ category: 'material', amount: '20000000' }, { category: 'subcontract', amount: '8000000' }] });
  });

  it('records mobilization advance via manual journal', async () => {
    const je = await ok('post', '/journals?post=true', {
      date: today,
      narration: 'Mobilization advance received',
      lines: [
        { accountId: ids.bank, debit: '1000000' },
        { accountId: ids.clientAdvance, credit: '1000000', partyId: ids.client, projectId: ids.project },
      ],
    });
    expect(je.status).toBe('posted');
  });

  it('runs procure-to-pay with weighted-average stock', async () => {
    const po = await ok('post', '/purchase-orders', {
      partyId: ids.vendor, date: today, warehouseId: ids.central, projectId: ids.project,
      lines: [{ itemId: ids.item, quantity: '100', unitPrice: '500', vatCodeId: ids.vat15 }],
    });
    expect(po.total).toBe('57500.00');
    const rejected = await api('post', '/goods-receipts', { orderId: po.id, date: today, lines: [{ orderLineId: po.lines[0].id, quantity: '100' }] });
    expect(rejected.status).toBe(400); // not approved yet
    await ok('post', `/purchase-orders/${po.id}/approve`);
    const grn = await ok('post', '/goods-receipts', { orderId: po.id, date: today, lines: [{ orderLineId: po.lines[0].id, quantity: '100' }] });
    expect(grn.status).toBe('posted');

    const bill = await ok('post', `/bills/from-receipt/${grn.id}`);
    expect(bill.total).toBe('57500.00');
    await ok('post', `/bills/${bill.id}/post`);

    const pay = await ok('post', '/payments', {
      direction: 'out', partyId: ids.vendor, date: today, cashAccountId: ids.bank, method: 'bank_transfer',
      amount: '57500', tdsCodeId: ids.tdsSupply, allocations: [{ billId: bill.id, amount: '57500' }],
    });
    expect(pay.tdsAmount).toBe('2875.00');
    expect(pay.netAmount).toBe('54625.00');
    expect((await ok('get', `/bills/${bill.id}`)).status).toBe('paid');

    // Issue 40 bags to project → material cost 20,000 at avg cost 500
    const issue = await ok('post', '/stock/documents?post=true', {
      type: 'issue', date: today, fromWarehouseId: ids.central, projectId: ids.project,
      lines: [{ itemId: ids.item, quantity: '40' }],
    });
    expect(issue.status).toBe('posted');
    const over = await api('post', '/stock/documents?post=true', { type: 'issue', date: today, fromWarehouseId: ids.central, projectId: ids.project, lines: [{ itemId: ids.item, quantity: '61' }] });
    expect(over.status).toBe(400);

    const item = await ok('get', `/items/${ids.item}`);
    expect(item.stock[0].quantity).toBe('60.0000');
    expect(item.stock[0].value).toBe('30000.00');
  });

  it('bills the client through an RA bill and receives payment', async () => {
    const boq = await ok('post', `/projects/${ids.project}/boq`, { code: '1.1', description: 'RCC work in approach slab', uom: 'cum', quantity: '100', rate: '12000' });
    const ra = await ok('post', '/ra-bills', { projectId: ids.project, date: today, lines: [{ boqItemId: boq.id, currentQty: '15' }] });
    expect(ra.grossAmount).toBe('180000.00');
    expect(ra.retentionAmount).toBe('18000.00');
    expect(ra.advanceRecovery).toBe('18000.00');
    expect(ra.vatAmount).toBe('13500.00');
    expect(ra.netAmount).toBe('157500.00');

    const approved = await ok('post', `/ra-bills/${ra.id}/approve`);
    expect(approved.status).toBe('approved');
    const inv = await ok('get', `/invoices/${approved.invoiceId}`);
    expect(inv.total).toBe('157500.00');

    const rcv = await ok('post', '/payments', {
      direction: 'in', partyId: ids.client, date: today, cashAccountId: ids.bank, method: 'cheque', chequeNo: 'CHQ-1',
      amount: '157500', tdsCodeId: ids.tdsContract, vdsCodeId: ids.vds75, allocations: [{ invoiceId: inv.id, amount: '157500' }],
    });
    expect(rcv.tdsAmount).toBe('11025.00');
    expect(rcv.vdsAmount).toBe('11812.50');
    expect((await ok('get', `/invoices/${inv.id}`)).status).toBe('paid');

    const tooMuch = await api('post', '/ra-bills', { projectId: ids.project, date: today, lines: [{ boqItemId: boq.id, currentQty: '86' }] });
    expect(tooMuch.status).toBe(400);
  });

  it('books a subcontractor bill with retention', async () => {
    const wo = await ok('post', '/work-orders', {
      projectId: ids.project, partyId: ids.sub, date: today, retentionPercent: '5',
      lines: [{ description: 'Brick masonry', uom: 'sft', quantity: '1000', rate: '90' }],
    });
    const sb = await ok('post', '/work-orders/bills', { workOrderId: wo.id, date: today, lines: [{ workOrderLineId: wo.lines[0].id, currentQty: '400' }] });
    expect(sb.grossAmount).toBe('36000.00');
    expect(sb.retentionAmount).toBe('1800.00');
    expect(sb.netAmount).toBe('34200.00');
  });

  it('runs payroll and posts labor cost to the project', async () => {
    const emp = await ok('post', '/employees', { firstName: 'Rahim', lastName: 'Uddin', joiningDate: '2026-01-01', currentProjectId: ids.project });
    await ok('post', '/salary-structures', { employeeId: emp.id, effectiveFrom: '2026-01-01', basic: '30000', houseRent: '15000', medical: '3000', conveyance: '2000', pfPercent: '10' });
    const run = await ok('post', '/payroll-runs', { month: today.slice(0, 7) });
    expect(run.payslips).toHaveLength(1);
    expect(run.payslips[0].netPay).toBe('46583.33');
    const fin = await ok('post', `/payroll-runs/${run.id}/finalize`);
    expect(fin.status).toBe('finalized');
  });

  it('keeps the books balanced and reports project cost', async () => {
    const tb = await ok('get', `/reports/trial-balance?asOf=${today}`);
    expect(tb.balanced).toBe(true);
    const bs = await ok('get', `/reports/balance-sheet?asOf=${today}`);
    expect(bs.balanced).toBe(true);

    const s = await ok('get', `/projects/${ids.project}/summary`);
    const cat = (c: string) => s.categories.find((x: { category: string }) => x.category === c);
    expect(cat('material').actual).toBe('20000.00');
    expect(cat('subcontract').actual).toBe('36000.00');
    expect(cat('labor').actual).toBe('50000.00');
    expect(s.totals.revenue).toBe('180000.00');
    expect(s.totals.advanceOutstanding).toBe('982000.00');

    const tax = await ok('get', `/reports/tax-summary?from=${today.slice(0, 8)}01&to=${today}`);
    expect(tax.vat.outputVat).toBe('13500.00');
    expect(tax.vat.inputVat).toBe('7500.00');
    expect(tax.tdsDeductedFromVendors).toBe('2875.00');
  });

  it('isolates tenants', async () => {
    const other = await http.get('/projects').set('x-tenant', 'acme').set('authorization', `Bearer ${token}`);
    expect(other.status).toBe(403);
  });
});
