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

  it('opens a bank account with an existing balance and reconciles to it', async () => {
    const acct = await ok('post', '/bank-accounts', {
      accountCode: '1123',
      bankName: 'Dutch-Bangla Bank',
      branchName: 'Motijheel',
      accountNo: '1011223344',
      openingBalance: '500000',
      openingDate: today,
    });
    ids.bank2 = acct.id;
    expect(acct.balance).toBe('500000.00');

    const s = await ok('get', `/bank-accounts/${ids.bank2}/summary`);
    expect(s.openingBalance).toBe('500000.00');
    expect(s.bookBalance).toBe('500000.00');
    // Nothing is matched yet, so every ledger line is still "in transit".
    expect(s.unreconciledLedgerAmount).toBe('500000.00');
    expect(s.expectedStatementBalance).toBe('0.00');

    await ok('post', `/bank-accounts/${ids.bank2}/statement-lines`, {
      lines: [{ date: today, description: 'Opening balance brought forward', amount: '500000' }],
    });
    const recon = await ok('get', `/bank-accounts/${ids.bank2}/reconciliation`);
    const line = recon.unreconciledStatement[0];
    const ledgerLine = recon.unmatchedLedger.find((l: { amount: string }) => l.amount === '500000.00');
    await ok('post', `/bank-accounts/statement-lines/${line.id}/match`, { journalLineId: ledgerLine.id });

    const after = await ok('get', `/bank-accounts/${ids.bank2}/summary`);
    expect(after.openLedgerItems).toBe(0);
    expect(after.expectedStatementBalance).toBe('500000.00');
    const closed = await ok('post', `/bank-accounts/${ids.bank2}/reconciliation/close`, {
      statementDate: today,
      statementBalance: '500000',
    });
    expect(closed.matched).toBe(true);
    expect(closed.difference).toBe('0.00');
  });

  it('turns a won quotation into a project with its BOQ', async () => {
    const quote = await ok('post', '/quotations', {
      date: today,
      clientId: ids.client,
      title: 'Boundary Wall & Guard House',
      location: 'Savar',
      discount: '50000',
      vatPercent: '15',
      retentionPercent: '5',
      lines: [
        { lineNo: '1', description: 'Civil works', isSection: true },
        { lineNo: '1.1', description: 'RCC boundary wall', uom: 'm', quantity: '200', rate: '9500' },
        { lineNo: '1.2', description: 'Guard house', uom: 'nos', quantity: '1', rate: '450000' },
      ],
    });
    expect(quote.subtotal).toBe('2350000.00');
    expect(quote.vatAmount).toBe('345000.00');
    expect(quote.total).toBe('2645000.00');

    const won = await ok('post', `/quotations/${quote.id}/win`, {
      projectCode: 'PRJ-QTN-1',
      startDate: today,
      mobilizationAdvance: '0',
      advanceRecoveryPercent: '10',
      createSiteStore: true,
    });
    ids.quoteProject = won.projectId;
    expect(won.quotation.status).toBe('won');

    const project = await ok('get', `/projects/${ids.quoteProject}`);
    expect(project.contractValue).toBe('2300000.00');
    expect(project.retentionPercent).toBe('5.000000');
    const boq = await ok('get', `/projects/${ids.quoteProject}/boq`);
    expect(boq).toHaveLength(3);
    expect(boq.find((b: { code: string }) => b.code === '1.1').amount).toBe('1900000.00');

    // A won quotation is locked against edits.
    const edit = await api('patch', `/quotations/${quote.id}`, { ...quote, lines: quote.lines });
    expect(edit.status).toBe(400);
  });

  it('tracks an investor through contribution, profit share and payout', async () => {
    ids.investor = (await ok('post', '/investors', { name: 'Rahman Holdings', type: 'company', phone: '01711000000' })).id;
    const agreement = await ok('post', '/investors/agreements', {
      investorId: ids.investor,
      projectId: ids.project,
      date: today,
      committedAmount: '1000000',
      profitSharePercent: '30',
      sharesLoss: true,
    });
    ids.agreement = agreement.id;

    // A second agreement cannot push the project's shared profit past 100%.
    const other = (await ok('post', '/investors', { name: 'Hasan Traders' })).id;
    const tooMuch = await api('post', '/investors/agreements', {
      investorId: other,
      projectId: ids.project,
      date: today,
      committedAmount: '100000',
      profitSharePercent: '75',
    });
    expect(tooMuch.status).toBe(400);

    await ok('post', '/investors/transactions', {
      investorId: ids.investor,
      agreementId: ids.agreement,
      projectId: ids.project,
      date: today,
      type: 'contribution',
      amount: '1000000',
      cashAccountId: ids.bank,
      method: 'bank_transfer',
      reference: 'FT-9911',
    });

    // Project profit so far: 180,000 revenue less 106,000 of material, subcontract and labor.
    const ent = await ok('get', `/investors/projects/${ids.project}/entitlements`);
    expect(ent.projectProfit).toBe('74000.00');
    const row = ent.investors.find((r: { investorId: string }) => r.investorId === ids.investor);
    expect(row.entitlement).toBe('22200.00');
    expect(row.toBook).toBe('22200.00');

    const alloc = await ok('post', '/investors/allocate-profit', {
      agreementId: ids.agreement,
      date: today,
      // The whole project life: the payroll entry is dated at month end, after today.
      periodFrom: '2020-01-01',
      periodTo: '2099-12-31',
    });
    expect(alloc.amount).toBe('22200.00');

    const after = await ok('get', `/investors/projects/${ids.project}/entitlements`);
    expect(after.investors.find((r: { investorId: string }) => r.investorId === ids.investor).toBook).toBe('0.00');

    await ok('post', '/investors/transactions', {
      investorId: ids.investor,
      agreementId: ids.agreement,
      date: today,
      type: 'payout',
      amount: '22200',
      cashAccountId: ids.bank,
    });
    const overdraw = await api('post', '/investors/transactions', {
      investorId: ids.investor,
      date: today,
      type: 'payout',
      amount: '5000000',
      cashAccountId: ids.bank,
    });
    expect(overdraw.status).toBe(400);

    const statement = await ok('get', `/investors/${ids.investor}/statement`);
    expect(statement.summary.contributed).toBe('1000000.00');
    expect(statement.summary.profitBooked).toBe('22200.00');
    expect(statement.summary.paidOut).toBe('22200.00');
    expect(statement.summary.balance).toBe('1000000.00');
  });

  it('files company documents and flags the ones expiring', async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await ok('post', '/company-documents', {
      category: 'trade_licence',
      title: 'Trade Licence — Dhaka South',
      docNo: 'TRAD/DSCC/2026/4471',
      issuedBy: 'DSCC',
      issueDate: today,
      expiryDate: soon,
    });
    await ok('post', '/company-documents', { category: 'incorporation', title: 'Certificate of Incorporation', docNo: 'C-1188/2019' });
    const list = await ok('get', '/company-documents');
    expect(list.total).toBe(2);
    const expiring = await ok('get', '/company-documents/expiring');
    expect(expiring).toHaveLength(1);
    expect(expiring[0].state).toBe('expiring');
    expect(expiring[0].daysLeft).toBeLessThanOrEqual(10);
  });

  it('runs an EB-3 case from job order to visa', async () => {
    ids.employer = (await ok('post', '/eb3/employers', {
      code: 'USE-01',
      name: 'Midwest Food Processing LLC',
      city: 'Des Moines',
      state: 'IA',
      industry: 'Meat processing',
    })).id;
    const job = await ok('post', '/eb3/job-orders', {
      employerId: ids.employer,
      title: 'Meat Cutter',
      socCode: '51-3021',
      positions: 1,
      offeredWage: '19.50',
      wageUnit: 'hour',
      worksiteCity: 'Des Moines',
      worksiteState: 'IA',
      openedDate: today,
    });
    ids.job = job.id;
    ids.candidate = (await ok('post', '/eb3/candidates', {
      fullName: 'Md. Sohel Rana',
      passportNo: 'BW0912345',
      phone: '01811223344',
      skill: 'Meat cutting',
      englishLevel: 'basic',
    })).id;

    const kase = await ok('post', '/eb3/cases', {
      candidateId: ids.candidate,
      employerId: ids.employer,
      jobOrderId: ids.job,
      openedDate: today,
      agreedFee: '600000',
    });
    ids.case = kase.id;
    expect(kase.stage).toBe('prevailing_wage');
    expect(kase.documents.length).toBeGreaterThan(5);
    expect(kase.events).toHaveLength(1);

    // The job order had one seat, so it is full and a second case cannot take it.
    const filled = await ok('get', '/eb3/job-orders');
    expect(filled.data.find((j: { id: string }) => j.id === ids.job).status).toBe('filled');
    const second = (await ok('post', '/eb3/candidates', { fullName: 'Abdul Karim' })).id;
    const noSeat = await api('post', '/eb3/cases', { candidateId: second, employerId: ids.employer, jobOrderId: ids.job, openedDate: today });
    expect(noSeat.status).toBe(400);

    await ok('post', `/eb3/cases/${ids.case}/advance`, { stage: 'perm_filed', date: today, permCaseNo: 'A-26001-99887' });
    await ok('post', `/eb3/cases/${ids.case}/advance`, { stage: 'i140_approved', date: today, i140Receipt: 'MSC2690012345' });
    // An earlier stage records its reference without rewinding the case.
    const back = await ok('post', `/eb3/cases/${ids.case}/advance`, { stage: 'perm_approved', date: today });
    expect(back.stage).toBe('i140_approved');
    expect(back.priorityDate).toBe(today);
    expect(back.permCaseNo).toBe('A-26001-99887');

    await ok('post', '/eb3/payments', {
      caseId: ids.case,
      candidateId: ids.candidate,
      date: today,
      type: 'service_fee',
      direction: 'in',
      amount: '250000',
      cashAccountId: ids.bank,
      method: 'bank_transfer',
    });
    await ok('post', '/eb3/payments', {
      caseId: ids.case,
      candidateId: ids.candidate,
      date: today,
      type: 'medical',
      direction: 'out',
      amount: '15000',
      cashAccountId: ids.bank,
      method: 'cash',
    });
    const withFees = await ok('get', `/eb3/cases/${ids.case}`);
    expect(withFees.money.collected).toBe('250000.00');
    expect(withFees.money.due).toBe('350000.00');
    expect(withFees.money.spentOnBehalf).toBe('15000.00');

    const visa = await ok('post', `/eb3/cases/${ids.case}/advance`, { stage: 'visa_approved', date: today, visaNumber: 'V1234567', consulate: 'US Embassy Dhaka' });
    expect(visa.candidate.status).toBe('visa_issued');
    const departed = await ok('post', `/eb3/cases/${ids.case}/advance`, { stage: 'departed', date: today });
    expect(departed.status).toBe('closed');

    const pipeline = await ok('get', '/eb3/pipeline');
    expect(pipeline.find((p: { stage: string }) => p.stage === 'departed').count).toBe(0);
  });

  it('still balances after investor, quotation and EB-3 postings', async () => {
    const tb = await ok('get', `/reports/trial-balance?asOf=${today}`);
    expect(tb.balanced).toBe(true);
    const bs = await ok('get', `/reports/balance-sheet?asOf=${today}`);
    expect(bs.balanced).toBe(true);
  });

  it('isolates tenants', async () => {
    const other = await http.get('/projects').set('x-tenant', 'acme').set('authorization', `Bearer ${token}`);
    expect(other.status).toBe(403);
  });
});
