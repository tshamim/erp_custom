/**
 * Platform-owner controls, vendor management, attachments and CSV import,
 * against a freshly provisioned tenant.
 */
import '../src/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/db-exception.filter';

const slug = `e2p_${Date.now().toString(36)}`;
const today = new Date().toISOString().slice(0, 10);

describe('Platform control & vendor management (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let platformToken = '';
  let token = '';
  let tenantId = '';
  const ids: Record<string, string> = {};

  const tenantReq = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => {
    const r = http[method](url).set('x-tenant', slug).set('authorization', `Bearer ${token}`);
    return body ? r.send(body) : r;
  };
  const ok = async (method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => {
    const res = await tenantReq(method, url, body);
    if (res.status >= 300) throw new Error(`${method.toUpperCase()} ${url} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const platform = (method: 'get' | 'post' | 'put', url: string, body?: object) => {
    const r = http[method](url).set('authorization', `Bearer ${platformToken}`);
    return body ? r.send(body) : r;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    const p = await http.post('/platform/auth/login').send({ email: process.env.PLATFORM_ADMIN_EMAIL, password: process.env.PLATFORM_ADMIN_PASSWORD });
    platformToken = p.body.accessToken;
    const created = await platform('post', '/platform/tenants', {
      slug,
      name: 'Platform Test Ltd',
      adminName: 'PT Admin',
      adminEmail: 'admin@pt.test',
      adminPassword: 'Pt@123456',
      modules: ['construction', 'hr', 'finance', 'inventory', 'procurement', 'vendor'], // payroll deliberately withheld
    });
    expect(created.status).toBe(201);
    tenantId = created.body.id;
    for (let i = 0; i < 60; i++) {
      const s = await platform('get', `/platform/tenants/${tenantId}`);
      if (s.body.status === 'active') break;
      if (s.body.status === 'failed') throw new Error(JSON.stringify(s.body.jobs));
      await new Promise((r) => setTimeout(r, 500));
    }
    const login = await http.post('/auth/login').set('x-tenant', slug).send({ email: 'admin@pt.test', password: 'Pt@123456' });
    token = login.body.accessToken;
    expect(login.status).toBe(200);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('licenses only the selected modules', async () => {
    const me = await ok('get', '/auth/me');
    expect(me.modules.sort()).toEqual(['construction', 'finance', 'hr', 'inventory', 'procurement', 'vendor']);
    expect(me.permissions).not.toContain('payroll.run.read');
    expect(me.permissions).toContain('finance.invoice.create');
    expect((await tenantReq('get', '/payroll-runs')).status).toBe(403);
  });

  it('turns a module on and off from the platform', async () => {
    expect((await platform('put', `/platform/tenants/${tenantId}/modules`, { modules: { payroll: true } })).status).toBe(200);
    expect((await tenantReq('get', '/payroll-runs')).status).toBe(200);

    await platform('put', `/platform/tenants/${tenantId}/modules`, { modules: { payroll: false, finance: false } });
    expect((await tenantReq('get', '/payroll-runs')).status).toBe(403);
    expect((await tenantReq('get', '/invoices')).status).toBe(403);
    // Core stays available regardless of licensing.
    expect((await tenantReq('get', '/users')).status).toBe(200);

    await platform('put', `/platform/tenants/${tenantId}/modules`, { modules: { finance: true, payroll: true } });
    expect((await tenantReq('get', '/invoices')).status).toBe(200);
  });

  it('enforces the subscription user limit', async () => {
    await platform('put', `/platform/tenants/${tenantId}/subscription`, { plan: 'starter', maxUsers: 1 });
    const denied = await tenantReq('post', '/users', { name: 'Second User', email: 'second@pt.test', password: 'Second@123', roleIds: [] });
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/User limit/);
    await platform('put', `/platform/tenants/${tenantId}/subscription`, { plan: 'standard', maxUsers: 25 });
    expect((await tenantReq('post', '/users', { name: 'Second User', email: 'second@pt.test', password: 'Second@123', roleIds: [] })).status).toBe(201);
  });

  it('lets the platform owner log in as a tenant user, and audits it', async () => {
    const res = await platform('post', `/platform/tenants/${tenantId}/impersonate`, { reason: 'e2e support check' });
    expect(res.status).toBe(201);
    expect(res.body.profile.impersonatedBy).toBe(process.env.PLATFORM_ADMIN_EMAIL);
    const impersonated = res.body.accessToken as string;

    const created = await http
      .post('/departments')
      .set('x-tenant', slug)
      .set('authorization', `Bearer ${impersonated}`)
      .send({ code: 'IMP', name: 'Created during support session' });
    expect(created.status).toBe(201);

    const audit = await ok('get', '/audit-logs?entity=department');
    expect(audit.data[0].impersonatedBy).toBe(process.env.PLATFORM_ADMIN_EMAIL);
    const detail = await platform('get', `/platform/tenants/${tenantId}`);
    expect(detail.body.platformAudit.some((a: { action: string }) => a.action === 'tenant.impersonate')).toBe(true);
  });

  it('blocks purchasing from vendors that are not approved', async () => {
    const lk = await ok('get', '/lookups');
    ids.warehouse = lk.warehouses[0].id;
    ids.uom = lk.uoms.find((u: { code: string }) => u.code === 'bag').id;
    const vendor = await ok('post', '/parties', { type: 'vendor', name: 'Suspect Suppliers', vendorCategory: 'Cement' });
    ids.vendor = vendor.id;
    const item = await ok('post', '/items', { code: 'CEM-1', name: 'Cement', uomId: ids.uom });
    ids.item = item.id;

    await ok('post', `/vendors/${ids.vendor}/status`, { status: 'blacklisted', reason: 'Failed quality audit' });
    const blocked = await tenantReq('post', '/purchase-orders', {
      partyId: ids.vendor,
      date: today,
      warehouseId: ids.warehouse,
      lines: [{ itemId: ids.item, quantity: '10', unitPrice: '500' }],
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/blacklisted/);

    await ok('post', `/vendors/${ids.vendor}/status`, { status: 'approved' });
    expect((await tenantReq('post', '/purchase-orders', { partyId: ids.vendor, date: today, warehouseId: ids.warehouse, lines: [{ itemId: ids.item, quantity: '10', unitPrice: '500' }] })).status).toBe(201);
  });

  it('scores vendors and tracks document expiry', async () => {
    await ok('post', '/vendor-evaluations', { partyId: ids.vendor, date: today, quality: 5, delivery: 4, price: 3, service: 4 });
    await ok('post', '/vendor-documents', { partyId: ids.vendor, docType: 'Trade Licence', docNo: 'TL-1', expiryDate: '2020-01-01' });
    const v = await ok('get', `/vendors/${ids.vendor}`);
    expect(v.rating.overall).toBe(4);
    expect(v.kpis.poCount).toBe(1);
    expect(v.documents[0].state).toBe('expired');
    const compliance = await ok('get', '/vendors/compliance');
    expect(compliance.some((c: { partyId: string }) => c.partyId === ids.vendor)).toBe(true);

    // List aggregates are correlated sub-selects — guard against them silently returning zero.
    const list = await ok('get', '/vendors?search=Suspect');
    expect(list.data[0]).toMatchObject({ rating: '4.00', purchases: '5000.00', expiredDocs: 1 });
    const parties = await ok('get', '/parties?search=Suspect');
    expect(parties.data[0].payable).toBe('0');
  });

  it('stores and serves attachments', async () => {
    const up = await tenantReq('post', `/attachments?entity=party&entityId=${ids.vendor}`).attach('file', Buffer.from('trade licence scan'), { filename: 'licence.txt', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body.storageKey).toBeUndefined();
    const list = await ok('get', `/attachments?entity=party&entityId=${ids.vendor}`);
    expect(list).toHaveLength(1);
    const file = await tenantReq('get', `/attachments/${up.body.id}/download`);
    expect(file.status).toBe(200);
    expect(file.text).toBe('trade licence scan');
    expect((await tenantReq('delete', `/attachments/${up.body.id}`)).status).toBe(200);
    expect(await ok('get', `/attachments?entity=party&entityId=${ids.vendor}`)).toHaveLength(0);
  });

  it('imports CSV rows and rejects a file with bad references', async () => {
    const dry = await ok('post', '/import/items?dryRun=true', {
      rows: [
        { code: 'IMP-1', name: 'Imported cement', unit: 'bag' },
        { code: 'IMP-2', name: 'Bad unit', unit: 'nope' },
      ],
    });
    expect(dry.errors).toHaveLength(1);
    expect(dry.errors[0].message).toMatch(/Unknown unit/);
    expect(dry.created).toBe(0);

    const run = await ok('post', '/import/items', { rows: [{ code: 'IMP-1', name: 'Imported cement', unit: 'bag', reorderLevel: '50' }] });
    expect(run.created).toBe(1);
    const items = await ok('get', '/items?search=IMP-1');
    expect(items.data[0].name).toBe('Imported cement');

    // Duplicate code → whole import rejected.
    const dupe = await tenantReq('post', '/import/items', { rows: [{ code: 'IMP-1', name: 'Again', unit: 'bag' }] });
    expect(dupe.status).toBe(400);
  });

  it('reports cross-tenant usage on the platform overview', async () => {
    const res = await platform('get', '/platform/overview');
    expect(res.status).toBe(200);
    const mine = res.body.tenants.find((t: { slug: string }) => t.slug === slug);
    expect(mine.stats.users.total).toBeGreaterThanOrEqual(2);
    expect(mine.dbSizeBytes).toBeGreaterThan(0);
    expect(res.body.totals.tenants).toBeGreaterThanOrEqual(1);
    expect(res.body.moduleAdoption.find((m: { module: string }) => m.module === 'vendor').tenants).toBeGreaterThanOrEqual(1);
  });

  it('suspends a company and locks its users out', async () => {
    expect((await platform('post', `/platform/tenants/${tenantId}/suspend`)).status).toBe(201);
    const res = await tenantReq('get', '/users');
    expect(res.status).toBe(403);
    expect((await platform('post', `/platform/tenants/${tenantId}/activate`)).status).toBe(201);
    expect((await tenantReq('get', '/users')).status).toBe(200);
  });
});
