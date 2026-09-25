# Deployment guide

How to put BuildERP on a server for real use. Everything runs in Docker; you do not install Node,
PostgreSQL or MinIO by hand.

Read [Before you start](#before-you-start) and [Secrets](#secrets) even if you skip the rest — the
encryption key in particular cannot be recovered once data exists.

## Before you start

**Server sizing.** One server runs the whole stack. Each company gets its own database on the same
PostgreSQL instance.

| Companies | Users | vCPU | RAM | Disk |
|---|---|---|---|---|
| 1–3 | up to 25 | 2 | 4 GB | 60 GB SSD |
| 4–15 | up to 100 | 4 | 8 GB | 150 GB SSD |
| 15+ | 100+ | 8 | 16 GB | 300 GB SSD, and move PostgreSQL to its own server |

Ubuntu 22.04 or 24.04 LTS. Disk matters more than CPU: attachments (drawings, scanned challans) grow
faster than the database.

**Software.** Docker Engine with the Compose plugin, and git.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out and back in
docker compose version
```

**DNS.** Two A records pointing at the server's public IP, created before you start so certificates
can be issued:

| Record | Purpose |
|---|---|
| `erp.example.com` | the application |
| `api.example.com` | the API |

**Firewall.** Open 22, 80 and 443 only. Nothing else needs to be reachable — the database, Redis and
MinIO are on Docker's internal network and publish no host ports in production.

```bash
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

## Install

```bash
sudo mkdir -p /opt/erp && sudo chown "$USER" /opt/erp
git clone https://github.com/tshamim/erp_custom.git /opt/erp
cd /opt/erp
cp .env.example .env
```

## Secrets

Generate every secret on the server. Never reuse the development values, and never commit `.env`.

```bash
cd /opt/erp
{
  echo "TENANT_SECRET_KEY=$(openssl rand -hex 32)"
  echo "JWT_SECRET=$(openssl rand -hex 32)"
  echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
  echo "PG_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
  echo "MINIO_SECRET_KEY=$(openssl rand -base64 24 | tr -d '/+=')"
} >> .env
```

Then edit `.env` and set the rest by hand:

```ini
APP_DOMAIN=erp.example.com
API_DOMAIN=api.example.com
WEB_ORIGIN=https://erp.example.com          # the API accepts browser calls only from here
NEXT_PUBLIC_API_URL=https://api.example.com # baked into the browser bundle at build time

PG_HOST=postgres
PG_PORT=5432
PG_ADMIN_USER=erp
CONTROL_DATABASE_URL=postgres://erp:THE_PG_ADMIN_PASSWORD_YOU_JUST_GENERATED@postgres:5432/erp_control

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=erp

PLATFORM_ADMIN_EMAIL=owner@yourcompany.com
PLATFORM_ADMIN_PASSWORD=<a strong password you choose>
```

Remove the duplicate keys the generator appended above the ones already in the file, keeping the
generated values. Then lock the file down:

```bash
chmod 600 .env
```

> **`TENANT_SECRET_KEY` encrypts each company's database password.** Lose it and the application can
> no longer open any company database — the data is still there, but the credentials are unreadable.
> Keep a copy in a password manager before going live. Changing it after companies exist requires
> re-encrypting those rows.

## First deployment

```bash
cd /opt/erp
docker compose -f docker-compose.yml -f docker-compose.prod.yml -p erp up -d --build
```

`-f docker-compose.yml -f docker-compose.prod.yml` matters: it excludes `docker-compose.override.yml`,
which is the development file that publishes database and MinIO ports to the host. Use these two
files for every production command — define an alias so you cannot forget:

```bash
echo "alias erp='docker compose -f /opt/erp/docker-compose.yml -f /opt/erp/docker-compose.prod.yml -p erp'" >> ~/.bashrc
source ~/.bashrc
```

The first build takes 5–10 minutes. Compose then: starts PostgreSQL and waits for it to be healthy →
runs the `migrate` service once, which creates the control database, applies migrations to every
existing company database and seeds the platform administrator from `.env` → starts the API and waits
for its health check → starts the web app → starts Caddy, which obtains certificates from Let's
Encrypt.

Verify:

```bash
erp ps                                   # every service Up, migrate Exited (0)
erp logs migrate --no-log-prefix | tail  # "control migrations applied"
curl -s https://api.example.com/health   # {"ok":true,...}
```

## Create the first company

1. Open `https://erp.example.com/platform/login` and sign in with `PLATFORM_ADMIN_EMAIL` and its
   password.
2. **New company** → company name, a Company ID (lowercase, e.g. `acme`), the modules to license, and
   the first administrator's name, email and password.
3. The database is provisioned in about a second. Watch the status go from *provisioning* to *active*.
4. Staff sign in at `https://erp.example.com/login` with that Company ID.

Load their existing data through **Import CSV** on Items, Vendors, Employees and the project BOQ tab —
validate first, which reports bad rows without writing anything.

## HTTPS and certificates

Caddy handles certificates automatically, renewing about 30 days before expiry. Nothing to schedule.

If a certificate fails to issue, it is almost always DNS or the firewall:

```bash
dig +short erp.example.com          # must be this server's IP
erp logs caddy --tail 50
```

To give each company its own subdomain (`acme.erp.example.com`) instead of typing the Company ID at
login, you need a wildcard certificate, which requires a DNS-challenge build of Caddy and an API token
for your DNS provider. The commented block in `deploy/Caddyfile` shows the shape; the application
already resolves the company from the subdomain when one is present.

## Backups

`scripts/backup.sh` dumps every database (control plus one per company), archives the uploaded files
and copies `.env`, keeping 14 days by default.

```bash
chmod +x /opt/erp/scripts/backup.sh
sudo mkdir -p /var/backups/erp && sudo chown "$USER" /var/backups/erp
COMPOSE_PROJECT_NAME=erp /opt/erp/scripts/backup.sh /var/backups/erp 14
```

Schedule it daily and copy the files off the server:

```cron
0 2 * * * cd /opt/erp && COMPOSE_PROJECT_NAME=erp ./scripts/backup.sh /var/backups/erp 14 >> /var/log/erp-backup.log 2>&1
30 2 * * * rclone copy /var/backups/erp remote:erp-backups   # or aws s3 sync, or rsync
```

**Restore** — databases:

```bash
gunzip -c /var/backups/erp/postgres-YYYYMMDD-HHMMSS.sql.gz | erp exec -T postgres psql -U erp -d postgres
```

Files:

```bash
docker run --rm -v erp_miniodata:/data -v /var/backups/erp:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/files-YYYYMMDD-HHMMSS.tar.gz -C /data"
erp restart api
```

Restore `.env` from the same timestamp, or the restored databases cannot be opened.

**Test a restore before go-live**, on a spare server. An untested backup is a guess.

## Updating

```bash
cd /opt/erp
./scripts/backup.sh /var/backups/erp 14   # always first
git pull
erp up -d --build
```

The `migrate` service applies any new database changes to the control database and to every company
database before the API starts. Roll back by checking out the previous tag and rebuilding; restore the
database dump as well if the update included a migration.

Changing a value in `.env` needs a recreate, not a restart — a restart reuses the old environment:

```bash
erp up -d api web
```

## Day-to-day operations

| Task | Command |
|---|---|
| Status | `erp ps` |
| Logs | `erp logs -f api` |
| Restart one service | `erp restart api` |
| Apply migrations to all companies | `erp run --rm migrate` |
| Database shell | `erp exec postgres psql -U erp -d erp_control` |
| Disk usage | `df -h && docker system df` |
| Free space from old images | `docker image prune -af` |

Platform owners can also see every company's usage, storage and database size in the platform console,
and can sign in to a company for support — every such action is written to that company's audit trail
with the owner's email.

## Monitoring

Minimum worth having: an uptime check on `https://api.example.com/health` (UptimeRobot, Better Stack
or similar, alerting by email or SMS), and a disk-space alarm at 80%. The database, MinIO and API all
stop cleanly when the disk fills, and a full disk is the most common cause of an outage on a server
like this.

## Security checklist before handing over

- [ ] `.env` holds freshly generated secrets, is `chmod 600`, and `TENANT_SECRET_KEY` is saved in a password manager
- [ ] `PLATFORM_ADMIN_PASSWORD` changed from anything used in development
- [ ] Production started with both compose files, so Postgres, Redis and MinIO publish no host ports (`erp ps` shows ports only on Caddy)
- [ ] Firewall allows 22, 80, 443 only
- [ ] SSH by key, password authentication disabled
- [ ] HTTPS working on both domains, HTTP redirecting to it
- [ ] Automatic security updates on (`sudo apt install unattended-upgrades`)
- [ ] Backups running, copied off the server, and one restore actually tested
- [ ] Each staff member has a named account with the smallest role that fits — no shared logins

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `migrate` exits non-zero and the API never starts | Read `erp logs migrate`. Usually `CONTROL_DATABASE_URL` points at `localhost` instead of `postgres`, or the password does not match `PG_ADMIN_PASSWORD`. |
| Browser shows "Network error" after login | `WEB_ORIGIN` does not match the address in the browser, so the API rejects the call. Fix `.env` and `erp up -d api`. |
| Login page loads but nothing else does | The bundle was built with the wrong `NEXT_PUBLIC_API_URL`. It is baked in at build time: fix `.env` and rebuild with `erp up -d --build web`. |
| A company shows *failed* after creation | `erp logs api`, or open the company's Provisioning tab in the platform console, which prints each step. Usually the Postgres user lacks permission to create databases. |
| Uploads fail | MinIO unhealthy or out of disk: `erp ps`, `df -h`. |
| Certificate not issued | DNS not pointing here yet, or port 80 blocked; `erp logs caddy`. |
| Everything is slow | Check `df -h` first, then `erp exec postgres psql -U erp -d erp_control -c "select count(*) from pg_stat_activity"`. Raise `TENANT_POOL_MAX` only if connections are exhausted. |

## What is not included yet

Honest gaps, so nobody is surprised in production:

- **No high availability.** One server; a hardware failure means restoring from backup onto a new one.
- **No automated off-site copy.** `backup.sh` writes locally; the `rclone`/`aws s3` line above is yours to configure.
- **No email delivery configured.** Mailpit is a local development catcher and does not run in
  production. Outgoing mail needs an SMTP provider when that feature is switched on.
- **Company databases are provisioned in the API process**, not a background worker. Creating a company
  briefly occupies a request; at dozens of companies this should move to a queue (Redis is already
  running for it).
