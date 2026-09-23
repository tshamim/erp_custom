#!/usr/bin/env node
/**
 * Loads realistic demo data into an existing company through the public API.
 * Usage: node scripts/seed-demo.mjs <companyId> <adminEmail> <adminPassword> [apiUrl]
 */
const [slug, email, password, API = 'http://localhost:4100'] = process.argv.slice(2);
if (!slug || !email || !password) {
  console.error('Usage: node scripts/seed-demo.mjs <companyId> <adminEmail> <adminPassword> [apiUrl]');
  process.exit(1);
}

let token = '';
async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-tenant': slug, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const get = (p) => call('GET', p);
const post = (p, b = {}) => call('POST', p, b);
const put = (p, b) => call('PUT', p, b);

const today = new Date().toISOString().slice(0, 10);
// Only the current Bangladesh fiscal year (Jul–Jun) is open on a new company, so keep postings inside it.
const now = new Date();
const fyStart = `${now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1}-07-01`;
const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  return d < fyStart ? fyStart : d;
};
const month = today.slice(0, 7);

async function main() {
  token = (await post('/auth/login', { email, password })).accessToken;
  const lk = await get('/lookups');
  const by = (arr, code) => arr.find((x) => x.code === code)?.id;
  const uom = (c) => by(lk.uoms, c);
  const cat = (c) => by(lk.itemCategories, c);
  const tax = (c) => by(lk.taxCodes, c);
  const acct = (c) => by(lk.accounts, c);
  const central = by(lk.warehouses, 'CS');
  const dept = (c) => by(lk.departments, c);
  const desig = (n) => lk.designations.find((d) => d.name === n)?.id;

  console.log('• parties');
  const client1 = await post('/parties', { type: 'customer', name: 'Roads and Highways Department', binNo: '000123456-0101', tin: '123456789012', phone: '02-9551234', address: 'Sarak Bhaban, Tejgaon, Dhaka' });
  const client2 = await post('/parties', { type: 'customer', name: 'Green Valley Housing Ltd', binNo: '000765432-0202', address: 'Gulshan-2, Dhaka' });
  const cementCo = await post('/parties', { type: 'vendor', name: 'Shah Cement Industries Ltd', binNo: '000111222-0101', tin: '222333444555', defaultTdsCodeId: tax('TDS-SUPPLY') });
  const steelCo = await post('/parties', { type: 'vendor', name: 'BSRM Steels Ltd', binNo: '000333444-0101', defaultTdsCodeId: tax('TDS-SUPPLY') });
  const sandCo = await post('/parties', { type: 'vendor', name: 'Meghna Sand & Stone Suppliers' });
  const sub1 = await post('/parties', { type: 'subcontractor', name: 'Karim Masonry Works', phone: '01711-000111', defaultTdsCodeId: tax('TDS-CONTRACT') });
  const sub2 = await post('/parties', { type: 'subcontractor', name: 'Rahman Electrical Services', phone: '01811-222333' });

  console.log('• items');
  const mk = (code, name, u, c, cost, reorder, spec) => post('/items', { code, name, uomId: uom(u), categoryId: cat(c), standardCost: cost, reorderLevel: reorder, specification: spec, defaultVatCodeId: tax('VAT-15') });
  const cement = await mk('CEM-OPC', 'OPC Cement 50kg', 'bag', 'CEM', '520', '200', 'CEM-I 52.5N');
  const rod12 = await mk('STL-12', 'MS Rod 12mm', 'ton', 'STL', '98000', '5', '500W grade');
  const rod16 = await mk('STL-16', 'MS Rod 16mm', 'ton', 'STL', '97500', '5', '500W grade');
  const sand = await mk('AGG-SAND', 'Sylhet Sand (FM 2.5)', 'cft', 'AGG', '55', '2000');
  const stone = await mk('AGG-STONE', 'Stone Chips 3/4"', 'cft', 'AGG', '190', '1000');
  const brick = await mk('BRK-01', 'First Class Bricks', 'nos', 'BRK', '12', '20000');
  const diesel = await post('/items', { code: 'FUL-DSL', name: 'Diesel', uomId: uom('ltr'), categoryId: cat('FUL'), standardCost: '114', reorderLevel: '200' });

  console.log('• projects');
  const p1 = await post('/projects', {
    code: 'RHD-24', name: 'Dhaka Bypass Bridge Approach Road', clientId: client1.id, contractNo: 'RHD/DB/2026/14', contractValue: '185000000',
    location: 'Madanpur, Narayanganj', startDate: daysAgo(120), endDate: daysAgo(-420), status: 'active',
    retentionPercent: '10', vatPercent: '7.5', mobilizationAdvance: '18500000', advanceRecoveryPercent: '10',
  });
  const p2 = await post('/projects', {
    code: 'GVH-T2', name: 'Green Valley Tower-2 (G+14)', clientId: client2.id, contractValue: '420000000',
    location: 'Bashundhara R/A, Dhaka', startDate: daysAgo(60), endDate: daysAgo(-700), status: 'active',
    retentionPercent: '5', vatPercent: '7.5', mobilizationAdvance: '0', advanceRecoveryPercent: '0',
  });
  for (const [p, b] of [[p1, ['60000000', '25000000', '30000000', '12000000', '8000000']], [p2, ['160000000', '60000000', '70000000', '15000000', '20000000']]]) {
    await put(`/projects/${p.id}/budgets`, { budgets: ['material', 'labor', 'subcontract', 'equipment', 'overhead'].map((category, i) => ({ category, amount: b[i] })) });
  }

  console.log('• BOQ & schedule');
  await post(`/projects/${p1.id}/boq`, { code: '1', description: 'Earthwork', isSection: true, sortOrder: 1 });
  const b11 = await post(`/projects/${p1.id}/boq`, { code: '1.1', description: 'Earth filling in embankment with compaction', uom: 'cum', quantity: '45000', rate: '650', sortOrder: 2 });
  await post(`/projects/${p1.id}/boq`, { code: '2', description: 'Structural works', isSection: true, sortOrder: 3 });
  const b21 = await post(`/projects/${p1.id}/boq`, {
    code: '2.1', description: 'RCC (1:1.5:3) in approach slab incl. shuttering', uom: 'cum', quantity: '3200', rate: '14500', sortOrder: 4,
    materials: [{ itemId: cement.id, qtyPerUnit: '8.5', wastagePercent: '2' }, { itemId: sand.id, qtyPerUnit: '15', wastagePercent: '5' }, { itemId: stone.id, qtyPerUnit: '30', wastagePercent: '5' }],
  });
  const b22 = await post(`/projects/${p1.id}/boq`, { code: '2.2', description: 'Reinforcement 500W supply, fabrication & placing', uom: 'ton', quantity: '410', rate: '118000', sortOrder: 5, materials: [{ itemId: rod16.id, qtyPerUnit: '1', wastagePercent: '3' }] });
  const b23 = await post(`/projects/${p1.id}/boq`, { code: '2.3', description: 'Brick flat soling', uom: 'sqm', quantity: '12000', rate: '780', sortOrder: 6, materials: [{ itemId: brick.id, qtyPerUnit: '32', wastagePercent: '3' }] });
  const t1 = await post(`/projects/${p1.id}/tasks`, { code: '1', name: 'Mobilization & site setup', startDate: daysAgo(120), endDate: daysAgo(100), progress: '100', weight: '1' });
  await post(`/projects/${p1.id}/tasks`, { code: '2', name: 'Embankment earthwork', startDate: daysAgo(100), endDate: daysAgo(-60), progress: '45', weight: '3', boqItemId: b11.id });
  await post(`/projects/${p1.id}/tasks`, { code: '3', name: 'Approach slab casting', startDate: daysAgo(40), endDate: daysAgo(-200), progress: '15', weight: '4', boqItemId: b21.id });
  void t1;

  console.log('• mobilization advance');
  await post('/journals?post=true', { date: daysAgo(115), narration: 'Mobilization advance received from RHD', reference: 'RHD-ADV-01', lines: [{ accountId: acct('1121'), debit: '18500000' }, { accountId: acct('2180'), credit: '18500000', partyId: client1.id, projectId: p1.id }] });
  await post('/journals?post=true', { date: daysAgo(118), narration: 'Paid-up capital', lines: [{ accountId: acct('1121'), debit: '50000000' }, { accountId: acct('3100'), credit: '50000000' }] });

  console.log('• procurement');
  const buy = async (vendor, lines, warehouseId, projectId, date) => {
    const po = await post('/purchase-orders', { partyId: vendor.id, date, warehouseId, projectId, lines });
    await post(`/purchase-orders/${po.id}/approve`);
    const grn = await post('/goods-receipts', { orderId: po.id, date, challanNo: `CH-${Math.floor(Math.random() * 9000 + 1000)}`, lines: po.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })) });
    const bill = await post(`/bills/from-receipt/${grn.id}`);
    await post(`/bills/${bill.id}/post`);
    return { po, grn, bill: await get(`/bills/${bill.id}`) };
  };
  const site1 = p1.warehouses[0].id;
  const r1 = await buy(cementCo, [{ itemId: cement.id, quantity: '6000', unitPrice: '515', vatCodeId: tax('VAT-15') }], central, p1.id, daysAgo(90));
  const r2 = await buy(steelCo, [{ itemId: rod16.id, quantity: '80', unitPrice: '96500', vatCodeId: tax('VAT-15') }, { itemId: rod12.id, quantity: '25', unitPrice: '97800', vatCodeId: tax('VAT-15') }], site1, p1.id, daysAgo(80));
  await buy(sandCo, [{ itemId: sand.id, quantity: '40000', unitPrice: '52' }, { itemId: stone.id, quantity: '60000', unitPrice: '185' }, { itemId: brick.id, quantity: '150000', unitPrice: '11.5' }], site1, p1.id, daysAgo(75));
  await buy(cementCo, [{ itemId: cement.id, quantity: '3000', unitPrice: '530', vatCodeId: tax('VAT-15') }], central, null, daysAgo(20));
  // a draft PO awaiting approval
  await post('/purchase-orders', { partyId: steelCo.id, date: today, warehouseId: central, lines: [{ itemId: rod12.id, quantity: '30', unitPrice: '99000', vatCodeId: tax('VAT-15') }] });

  console.log('• payments to vendors');
  await post('/payments', { direction: 'out', partyId: cementCo.id, date: daysAgo(60), cashAccountId: acct('1121'), method: 'cheque', chequeNo: '0045121', amount: r1.bill.total, tdsCodeId: tax('TDS-SUPPLY'), allocations: [{ billId: r1.bill.id, amount: r1.bill.total }] });
  await post('/payments', { direction: 'out', partyId: steelCo.id, date: daysAgo(45), cashAccountId: acct('1121'), method: 'bank_transfer', amount: '5000000', tdsCodeId: tax('TDS-SUPPLY'), allocations: [{ billId: r2.bill.id, amount: '5000000' }] });

  console.log('• stock movements');
  await post('/stock/documents?post=true', { type: 'transfer', date: daysAgo(70), fromWarehouseId: central, toWarehouseId: site1, lines: [{ itemId: cement.id, quantity: '4000' }] });
  await post('/stock/documents?post=true', { type: 'issue', date: daysAgo(50), fromWarehouseId: site1, projectId: p1.id, lines: [{ itemId: cement.id, quantity: '2800', boqItemId: b21.id }, { itemId: sand.id, quantity: '5200', boqItemId: b21.id }, { itemId: stone.id, quantity: '10200', boqItemId: b21.id }] });
  await post('/stock/documents?post=true', { type: 'issue', date: daysAgo(35), fromWarehouseId: site1, projectId: p1.id, lines: [{ itemId: rod16.id, quantity: '62', boqItemId: b22.id }, { itemId: brick.id, quantity: '96000', boqItemId: b23.id }] });
  await post('/stock/documents?post=true', { type: 'opening', date: daysAgo(100), toWarehouseId: central, remarks: 'Opening stock', lines: [{ itemId: diesel.id, quantity: '500', unitCost: '112' }] });
  const sr = await post('/site-requisitions', { projectId: p1.id, date: daysAgo(2), requiredBy: daysAgo(-5), remarks: 'For approach slab pour #4', lines: [{ itemId: cement.id, quantity: '900', boqItemId: b21.id }, { itemId: stone.id, quantity: '3500' }] });
  await post(`/site-requisitions/${sr.id}/submit`);

  console.log('• subcontract');
  const wo = await post('/work-orders', { projectId: p1.id, partyId: sub1.id, date: daysAgo(70), retentionPercent: '5', scope: 'Brick flat soling and protection works', lines: [{ boqItemId: b23.id, description: 'Brick flat soling (labour only)', uom: 'sqm', quantity: '12000', rate: '140' }] });
  await post('/work-orders/bills', { workOrderId: wo.id, date: daysAgo(30), lines: [{ workOrderLineId: wo.lines[0].id, currentQty: '3000' }] });
  await post('/work-orders', { projectId: p2.id, partyId: sub2.id, date: daysAgo(20), retentionPercent: '5', scope: 'Temporary site electrification', lines: [{ description: 'Temporary electrical installation', uom: 'ls', quantity: '1', rate: '850000' }] });

  console.log('• RA bills & receipts');
  const ra1 = await post('/ra-bills', { projectId: p1.id, date: daysAgo(40), periodTo: daysAgo(41), lines: [{ boqItemId: b11.id, currentQty: '12000' }, { boqItemId: b21.id, currentQty: '220' }, { boqItemId: b22.id, currentQty: '35' }] });
  const ra1a = await post(`/ra-bills/${ra1.id}/approve`);
  const inv = await get(`/invoices/${ra1a.invoiceId}`);
  await post('/payments', { direction: 'in', partyId: client1.id, date: daysAgo(15), cashAccountId: acct('1121'), method: 'cheque', chequeNo: 'SBL-778812', amount: inv.total, tdsCodeId: tax('TDS-CONTRACT'), vdsCodeId: tax('VDS-7.5'), vdsAmount: inv.vatAmount, allocations: [{ invoiceId: inv.id, amount: inv.total }] });
  await post('/ra-bills', { projectId: p1.id, date: today, periodTo: today, lines: [{ boqItemId: b11.id, currentQty: '8000' }, { boqItemId: b23.id, currentQty: '3000' }] });

  console.log('• equipment & DPR');
  const exc = await post('/equipment', { code: 'EXC-01', name: 'Excavator Komatsu PC200', type: 'excavator', ownership: 'owned', hourlyRate: '4500', currentProjectId: p1.id, status: 'in_use' });
  const mix = await post('/equipment', { code: 'MIX-01', name: 'Concrete Mixer 10/7', type: 'mixer', ownership: 'owned', hourlyRate: '600', currentProjectId: p1.id, status: 'in_use' });
  for (let d = 1; d <= 5; d++) {
    await post('/equipment-logs', { equipmentId: exc.id, projectId: p1.id, date: daysAgo(d), hours: String(6 + (d % 3)), fuelLiters: '45' });
    await post('/equipment-logs', { equipmentId: mix.id, projectId: p1.id, date: daysAgo(d), hours: '8', fuelLiters: '10' });
    await post('/dpr', { projectId: p1.id, date: daysAgo(d), weather: d % 2 ? 'Sunny' : 'Cloudy', workDone: `Embankment filling chainage ${1 + d}+200 to ${1 + d}+450; compaction tests passed.`, manpower: [{ trade: 'Mason', count: 14 }, { trade: 'Helper', count: 38 }, { trade: 'Rod binder', count: 9 }] });
  }
  await post('/variations', { projectId: p1.id, date: daysAgo(10), description: 'Additional drainage culvert at Ch. 3+150', amount: '4250000' });

  console.log('• vendor management');
  await post('/vendor-documents', { partyId: cementCo.id, docType: 'Trade Licence', docNo: 'TRAD/DSCC/2026/1189', issueDate: daysAgo(300), expiryDate: daysAgo(-20) });
  await post('/vendor-documents', { partyId: cementCo.id, docType: 'VAT (BIN) Certificate', docNo: '000111222-0101', issueDate: daysAgo(700) });
  await post('/vendor-documents', { partyId: steelCo.id, docType: 'Trade Licence', docNo: 'TRAD/DNCC/2025/5521', expiryDate: daysAgo(10) });
  await post('/vendor-documents', { partyId: sub1.id, docType: 'Enlistment', docNo: 'ENL-2026-44', expiryDate: daysAgo(-300) });
  for (const [party, q, d, p, s, remark] of [
    [cementCo, 5, 4, 3, 4, 'Consistent strength test results; deliveries occasionally late in monsoon.'],
    [steelCo, 5, 5, 3, 5, 'Mill test certificates always provided.'],
    [sandCo, 3, 3, 5, 3, 'Cheapest source but FM varies between trips.'],
    [sub1, 4, 4, 4, 4, 'Good workmanship on brickwork.'],
  ]) {
    await post('/vendor-evaluations', { partyId: party.id, date: daysAgo(12), quality: q, delivery: d, price: p, service: s, remarks: remark });
  }
  await post(`/vendors/${sandCo.id}/status`, { status: 'on_hold', reason: 'Sand FM below specification in last two lots — pending re-test.' });
  await post('/parties', { type: 'vendor', name: 'Unverified Traders', vendorCategory: 'General' }).then((v) => post(`/vendors/${v.id}/status`, { status: 'pending', reason: 'New vendor — documents not yet submitted.' }));

  console.log('• HR');
  const emps = [];
  const staff = [
    ['Md. Arif', 'Hossain', 'ENG', 'Project Manager', '85000', p1.id],
    ['Nusrat', 'Jahan', 'ACC', 'Accountant', '45000', null],
    ['Tanvir', 'Ahmed', 'ENG', 'Site Engineer', '55000', p1.id],
    ['Shakil', 'Mia', 'PRC', 'Store Keeper', '28000', p1.id],
    ['Farhana', 'Akter', 'ADM', 'Managing Director', '180000', null],
  ];
  for (const [first, last, d, g, basic, proj] of staff) {
    const e = await post('/employees', { firstName: first, lastName: last, departmentId: dept(d), designationId: desig(g), joiningDate: daysAgo(400), currentProjectId: proj, phone: '017' + Math.floor(10000000 + Math.random() * 89999999), gender: first === 'Nusrat' || first === 'Farhana' ? 'female' : 'male' });
    const b = Number(basic) * 0.5;
    await post('/salary-structures', { employeeId: e.id, effectiveFrom: daysAgo(400), basic: String(b), houseRent: String(b * 0.5), medical: String(Math.min(b * 0.1, 12000)), conveyance: '3000', otherAllowance: String(Number(basic) - b - b * 0.5 - Math.min(b * 0.1, 12000) - 3000), pfPercent: '10' });
    emps.push(e);
  }
  for (const [first, trade, wage] of [['Jamal', 'Mason', '950'], ['Kamal', 'Mason', '950'], ['Rahim', 'Helper', '650'], ['Babul', 'Helper', '650'], ['Sujon', 'Rod binder', '850']]) {
    emps.push(await post('/employees', { firstName: first, lastName: `(${trade})`, employmentType: 'daily_wage', dailyWage: wage, designationId: desig(trade === 'Rod binder' ? 'Helper' : trade), departmentId: dept('SITE'), joiningDate: daysAgo(90), currentProjectId: p1.id }));
  }
  const monthStart = `${month}-01`;
  const fridays = (dateStr) => new Date(dateStr + 'T00:00:00Z').getUTCDay() === 5;
  for (let d = new Date(monthStart + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    if (fridays(date)) continue;
    await post('/attendance', { date, records: emps.map((e, i) => ({ employeeId: e.id, status: (i + d.getUTCDate()) % 13 === 0 ? 'absent' : (i + d.getUTCDate()) % 7 === 0 ? 'late' : 'present', overtimeHours: e.employmentType === 'daily_wage' && d.getUTCDate() % 3 === 0 ? '2' : '0' })) });
  }
  const types = lk.leaveTypes;
  await post('/leave/requests', { employeeId: emps[1].id, leaveTypeId: types.find((t) => t.code === 'CL').id, fromDate: daysAgo(-6), toDate: daysAgo(-7), reason: 'Family event' });

  console.log('• payroll (previous month)');
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const run = await post('/payroll-runs', { month: prev });
  await post(`/payroll-runs/${run.id}/finalize`);
  await post(`/payroll-runs/${run.id}/pay`, { cashAccountId: acct('1121'), date: `${month}-05` > today ? today : `${month}-05` });

  const tb = await get(`/reports/trial-balance?asOf=${today}`);
  console.log(`✔ demo data loaded for "${slug}" — trial balance ${tb.balanced ? 'balanced' : 'NOT balanced'} (${tb.totalDebit})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
