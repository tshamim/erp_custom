# BuildERP: multi-tenant construction ERP

BuildERP is an ERP for construction companies in Bangladesh. It covers projects, HR, payroll, finance, inventory and procurement. Every company (tenant) runs on its own PostgreSQL database.

| Layer | Tech |
|---|---|
| API | NestJS 11, Drizzle ORM, PostgreSQL 17, JWT (access + httpOnly refresh cookie), argon2 |
| Web | Next.js 15 (App Router), Tailwind v4, TanStack Query |
| Shared | `@erp/shared`: zod DTOs, permission keys · `@erp/db`: schemas, migrations, provisioning, BD seed data |
| Infra | docker compose: Postgres, Redis, MinIO, Mailpit |

## Architecture

```
                ┌────────────── erp_control (control DB) ──────────────┐
 browser ──►  API ─ tenants · tenant_databases (AES-GCM creds) · platform_admins · provisioning_jobs
   │  X-Tenant / subdomain                    │
   │                                          ▼
   └──────────►  TenantMiddleware ─► TenantConnectionService (LRU of pg pools)
                                               ├── erp_t_acme   (own role + database)
                                               ├── erp_t_delta
                                               └── …
```

* **Resolving the tenant.** The API reads the `X-Tenant` header or the subdomain (`acme.example.com`) and looks the tenant up in the control DB. The lookup is cached for 30 seconds. The request's AsyncLocalStorage context (`nestjs-cls`) then holds the Drizzle client for that tenant's own database.
* **Checking the token.** Access tokens carry `tid`. The guard rejects a token that was issued for a different tenant.
* **Provisioning a tenant.** Provisioning creates a dedicated Postgres role and database, runs the tenant migrations, then seeds defaults: roles and permissions, the Bangladesh chart of accounts, VAT/TDS/VDS codes, the current July–June fiscal year, units, item categories, Labour Act leave types and the admin user.
* **Migrating tenants.** `pnpm db:migrate:tenants` (or **Migrate all** in the platform UI) applies pending migrations to every active tenant. It also adds new permission keys.
* **Posting to the ledger.** Every GL entry goes through `PostingService` (`apps/api/src/ledger/posting.service.ts`). It checks that the entry balances, that the fiscal period is open, and that no line hits a group account. Posting rules (`account_mappings`) decide which account each automatic posting uses, and each company can edit them.
* **Valuing stock.** Stock uses a weighted-average cost. `StockService` is the only code that writes `stock_balances` and the immutable `stock_movements` ledger. Stock can never go negative.

## Modules

| Module | Highlights |
|---|---|
| Construction | Projects with site stores, BOQ with rate analysis (materials per unit, wastage), WBS schedule with weighted progress, site requisitions → issue or purchase requisition, subcontract work orders + measurement bills (retention), **RA bills** (retention, mobilization-advance recovery, VAT) that automatically post the client invoice, daily progress reports, equipment usage, variation orders, budget vs actual by cost category |
| HR | Employees (NID/TIN, bank/bKash, daily-wage workers), departments, designations, daily and site attendance sheets, leave with Friday/holiday-aware day counting and balances |
| Payroll | BD salary breakup (basic/house rent/medical/conveyance), overtime (2 × basic/208), PF, Eid festival bonus, income-tax slabs with exemption cap and minimum tax, payslips, posting to GL with labor cost by project, disbursement |
| Finance | Chart of accounts, manual journals with drafts and reversal, customers/vendors/subcontractors, AR invoices, AP bills (from GRN), receipts/payments with TDS/VDS withholding and allocation, bank accounts + reconciliation, fiscal period locks |
| Inventory & procurement | Items, warehouses, issue/transfer/adjustment/opening with GL, purchase requisitions → quotations → PO (approval) → GRN → vendor bill |
| Reports | Trial balance, P&L (whole company or per project), balance sheet, general ledger, AR/AP aging, VAT & withholding summary, stock valuation, dashboard |
| Admin | Users, custom roles with per-permission toggles, branches, audit log (before/after), company and payroll settings |

> Tax rates, slabs and leave entitlements are seeded as editable starting points. Check them against the current Finance Act and NBR SROs before go-live.

## Getting started

Prerequisites: Node 22+, pnpm 9, Docker.

```bash
cp .env.example .env          # then set TENANT_SECRET_KEY / JWT secrets (openssl rand -hex 32)
docker compose -p custom_erp up -d
pnpm install
pnpm build:packages
pnpm db:migrate:control       # control DB + platform admin from .env
pnpm dev                      # API :4100, web :3100
```

1. Sign in at http://localhost:3100/platform/login with `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`.
2. Click **New company**. Its database is provisioned in about a second.
3. Sign in at http://localhost:3100/login with the Company ID and the admin account you entered. You can also open `http://<companyid>.localhost:3100`.
4. Optional: load demo data:
   ```bash
   node scripts/seed-demo.mjs <companyId> <adminEmail> <adminPassword>
   ```

Ports are remapped (Postgres 5440, Redis 6390, MinIO 9010/9011, Mailpit 8035) so they don't clash with other local stacks.

## Development

| Task | Command |
|---|---|
| Change a schema | edit `packages/db/src/{control,tenant}/schema`, then `pnpm db:generate` |
| Apply to all tenants | `pnpm db:migrate:tenants` |
| Unit tests (posting, stock, payroll, RA bill, leave math) | `pnpm --filter @erp/api test` |
| End-to-end flow (provisions a fresh tenant) | `pnpm --filter @erp/api test:e2e` |
| Typecheck everything | `pnpm typecheck` |

Most master-data and document screens are generated from one config registry: `apps/web/lib/resources.tsx`. To add a screen, add a registry entry. Screens with their own workflow (projects, RA bills, attendance, payroll, payments, reports, admin) are hand-written pages under `apps/web/app/(app)`.

## Known gaps / next steps

* Provisioning runs in-process. The next step is to move it to a BullMQ worker (Redis is already in compose).
* The attachments table exists, but no upload UI is wired to MinIO yet.
* Price variance between GRN and bill is not split out. The bill clears GRNI at the bill price.
* Only a single currency (BDT) is supported, although the schema has `currency`/`fxRate` columns.
* The access token is kept in localStorage. The refresh token is an httpOnly cookie.
* There are no PDF exports yet. Documents print via browser print styles.
