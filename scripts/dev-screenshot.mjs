#!/usr/bin/env node
/**
 * Development screenshot helper: drives a headless Chrome over CDP to capture
 * full-page PNGs of the running app, signing in with a token minted from the API
 * (so authenticated screens can be captured without a real browser profile).
 *
 * Usage: node scripts/dev-screenshot.mjs <outDir> [width]
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, '..', '.env') });

const OUT = process.argv[2] ?? path.join(os.tmpdir(), 'erp-shots');
const WIDTH = Number(process.argv[3] ?? 1440);
const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3100';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
const PORT = 9333;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const SHOTS = [
  { name: '01-dashboard', url: '/', scope: 'tenant' },
  { name: '02-projects', url: '/projects', scope: 'tenant' },
  { name: '03-project-overview', url: '/projects/:project', scope: 'tenant' },
  { name: '04-project-boq', url: '/projects/:project#boq', scope: 'tenant', tab: 'BOQ' },
  { name: '05-vendors', url: '/vendors', scope: 'tenant' },
  { name: '06-vendor-360', url: '/vendors/:vendor', scope: 'tenant' },
  { name: '07-reports-trial-balance', url: '/reports', scope: 'tenant' },
  { name: '08-purchase-orders', url: '/m/purchase-orders', scope: 'tenant' },
  { name: '09-payroll-run', url: '/payroll/:payroll', scope: 'tenant' },
  { name: '10-stock', url: '/inventory/stock', scope: 'tenant' },
  { name: '11-platform-overview', url: '/platform', scope: 'platform' },
  { name: '12-platform-tenant', url: '/platform/tenants/:tenant', scope: 'platform' },
];

async function api(pathname, { token, tenant, method = 'GET', body } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: { 'content-type': 'application/json', ...(tenant ? { 'x-tenant': tenant } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}`);
  return res.json();
}

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();
  static async attach(wsUrl) {
    const c = new Cdp();
    c.#ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      c.#ws.addEventListener('open', resolve, { once: true });
      c.#ws.addEventListener('error', reject, { once: true });
    });
    c.#ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      const p = c.#pending.get(msg.id);
      if (!p) return;
      c.#pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
    return c;
  }
  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result.value;
  }
  close() {
    this.#ws.close();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!CHROME) throw new Error('Chrome or Edge not found');
  fs.mkdirSync(OUT, { recursive: true });

  // Sessions + the ids used in the parameterised routes.
  const tenantLogin = await api('/auth/login', { tenant: 'acme', method: 'POST', body: { email: 'admin@acme.com', password: process.env.DEMO_TENANT_PASSWORD ?? 'Acme@12345' } });
  const platformLogin = await api('/platform/auth/login', { method: 'POST', body: { email: process.env.PLATFORM_ADMIN_EMAIL, password: process.env.PLATFORM_ADMIN_PASSWORD } });
  const token = tenantLogin.accessToken;
  const project = (await api('/projects?pageSize=5', { token, tenant: 'acme' })).data.find((p) => p.code === 'RHD-24');
  const vendor = (await api('/vendors?pageSize=10', { token, tenant: 'acme' })).data.find((v) => v.name.startsWith('Shah'));
  const payroll = (await api('/payroll-runs', { token, tenant: 'acme' }))[0];
  const tenant = (await api('/platform/tenants', { token: platformLogin.accessToken })).find((t) => t.slug === 'acme');
  const ids = { project: project.id, vendor: vendor.id, payroll: payroll?.id, tenant: tenant.id };

  const sessions = {
    tenant: { scope: 'tenant', tenant: 'acme', accessToken: token, profile: tenantLogin.profile },
    platform: { scope: 'platform', accessToken: platformLogin.accessToken, profile: platformLogin.profile },
  };

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--disable-extensions',
    '--hide-scrollbars',
    `--window-size=${WIDTH},900`,
    'about:blank',
  ]);
  chrome.stderr.on('data', () => {});

  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  const page = targets.find((t) => t.type === 'page');
  const cdp = await Cdp.attach(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const results = [];
  for (const shot of SHOTS) {
    const url = WEB + shot.url.replace(/:(\w+)/g, (_, k) => ids[k] ?? '');
    if (url.includes('undefined')) continue;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false });
    // Seed the session on the app origin, then go to the page itself.
    await cdp.send('Page.navigate', { url: `${WEB}/login` });
    await sleep(1500);
    await cdp.evaluate(`localStorage.setItem('erp.session', ${JSON.stringify(JSON.stringify(sessions[shot.scope]))}); true`);
    await cdp.send('Page.navigate', { url: url.split('#')[0] });
    await sleep(shot.scope === 'platform' ? 6000 : 4500);
    if (shot.tab) {
      await cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(shot.tab)})?.click(); true`);
      await sleep(2500);
    }
    const { contentSize } = await cdp.send('Page.getLayoutMetrics');
    const height = Math.min(Math.ceil(contentSize.height), 6000);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = path.join(OUT, `${shot.name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    results.push(`${shot.name}.png  ${WIDTH}×${height}`);
    console.log(`✔ ${shot.name} → ${file}`);
  }

  cdp.close();
  chrome.kill();
  console.log(`\n${results.length} screenshots in ${OUT}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
