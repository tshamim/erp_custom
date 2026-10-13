# Deploying on Coolify

How to run Eclectic ERP on a server managed by [Coolify](https://coolify.io) v4. Coolify builds the
images from this repository, runs them with `docker-compose.coolify.yml`, and its proxy (Traefik)
issues the HTTPS certificates. For a plain server without Coolify, follow [DEPLOYMENT.md](DEPLOYMENT.md)
instead.

Read [Secrets](#2-generate-the-secrets) even if you skip the rest: the encryption key cannot be recovered
once companies exist.

## What runs

| Service | Public | Purpose |
|---|---|---|
| `web` | `https://erp.example.com` → port 3100 | Next.js app |
| `api` | `https://api.example.com` → port 4100 | NestJS API |
| `postgres` | no | control database plus one database per company |
| `minio` | no | uploaded attachments |
| `migrate` | no | runs on every deploy, applies migrations to every company, then exits |

Only `web` and `api` get a domain. The database and file storage stay on the resource's private
network.

## 1. Before you start

* **Server.** A Coolify-managed server sized as in [DEPLOYMENT.md → Before you start](DEPLOYMENT.md#before-you-start).
  2 vCPU / 4 GB RAM is the minimum: the first build of the web app alone needs about 2 GB.
* **DNS.** Two A records pointing at the server's public IP, created before the first deploy so
  certificates can be issued:

  | Record | Purpose |
  |---|---|
  | `erp.example.com` | the application |
  | `api.example.com` | the API |

  **The API hostname must start with `api.`** (for example `api.example.com` or `api.erp.example.com`).
  The API reads the first label of its own hostname as a Company ID unless that label is `api`, `app`,
  `www` or `platform`; a name like `erp-api.example.com` makes every platform request fail with
  *Unknown company "erp-api"*.

## 2. Generate the secrets

On any machine with OpenSSL:

```bash
echo "TENANT_SECRET_KEY=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "PG_ADMIN_PASSWORD=$(openssl rand -hex 24)"
echo "MINIO_SECRET_KEY=$(openssl rand -hex 24)"
```

Use hex for the database password: it is embedded in a connection URL, where `/`, `@` or `+` would
break it.

> **`TENANT_SECRET_KEY` encrypts each company's database password.** Lose it and the application can no
> longer open any company database. The data is still there, but the credentials are unreadable. Save
> it in a password manager before going live, and never change it once companies exist.

## 3. Create the resource

1. In Coolify: **Projects → (your project) → + New → Public Repository**. For a private fork, use
   **Private Repository (with GitHub App)** instead.
2. Repository URL `https://github.com/tshamim/erp_custom`, branch `main`.
3. **Build Pack: Docker Compose.**
4. **Base Directory** `/`, **Docker Compose Location** `/docker-compose.coolify.yml`.
5. Click **Continue**. Coolify reads the compose file and lists the services.

## 4. Assign the domains

In the resource's **General** tab, under the services:

| Service | Domains |
|---|---|
| `web` | `https://erp.example.com:3100` |
| `api` | `https://api.example.com:4100` |

Leave every other service empty. The `:3100` / `:4100` suffix tells Coolify which **container** port
to route to; visitors still use plain `https://erp.example.com` on port 443.

## 5. Set the environment variables

**Environment Variables → Developer view**, paste [`deploy/coolify.env.example`](deploy/coolify.env.example),
then replace every `<...>`:

* the five secrets from step 2,
* `WEB_ORIGIN` and `APP_URL` = the web domain, `NEXT_PUBLIC_API_URL` = the API domain, all with `https://`
  and no trailing slash,
* `NEXT_PUBLIC_APP_DOMAIN` = the web hostname **without** `https://` (e.g. `erp.example.com`),
* `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` for the platform owner,
* Mailtrap settings if you want email delivered. Leave the token empty and mail is only written to the log.

Save, then open `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_DOMAIN` and tick **Available at Buildtime** on
each (in some Coolify versions, **Build Variable**). The web app bakes both into the browser bundle while
it builds; without them the build fails.

`docker-compose.coolify.yml` marks the required variables with `${VAR:?}`, so a deploy with one missing
stops with *required variable … is missing a value* instead of starting half-configured.

## 6. Deploy

Click **Deploy**. The first build takes 5–10 minutes. Compose then:

1. starts PostgreSQL and MinIO and waits for them to be healthy,
2. runs `migrate`: creates the control database, migrates every company database and seeds the
   platform owner,
3. starts the API and waits for its health check,
4. starts the web app.

`migrate` shows as *Exited (0)* afterwards. That is expected, and it is excluded from the resource's
health status.

Verify:

```bash
curl -s https://api.example.com/health      # {"ok":true,...}
```

Then open `https://erp.example.com/platform/login` and sign in as the platform owner.

## 7. Create the first company

1. **New company** → name, a Company ID (lowercase, e.g. `acme`), modules to license, and the first
   administrator's name, email and password.
2. Staff sign in at `https://erp.example.com/login` with that Company ID.

## Updating

Push to `main`, then **Redeploy** in Coolify. Coolify can also deploy on every push: with the GitHub App
this is automatic, and with a public repository you add Coolify's webhook to the GitHub repo
(**Webhooks** tab of the resource). The `migrate` service applies new migrations to every company
before the new API starts.

Take a backup before every update that includes a migration (a new file under
`packages/db/migrations`). Roll back by redeploying the previous commit, and restore the database
dump if the update migrated.

**Changing variables.** Most take effect on **Restart**. `NEXT_PUBLIC_API_URL` is compiled into the
web bundle, so changing it needs a **Redeploy** (a rebuild).

## Backups

Coolify's built-in database backups cover standalone databases, not a Postgres service inside a
compose resource, so use [`scripts/backup-coolify.sh`](scripts/backup-coolify.sh) on the server. It
dumps every database (control plus one per company), archives the uploaded files, and saves the API's
environment, including `TENANT_SECRET_KEY`.

The script needs the **resource UUID**: the random id in the resource's Coolify URL
(`.../application/<uuid>`). Coolify uses it as the compose project name.

```bash
sudo mkdir -p /opt/erp-backup /var/backups/erp
sudo curl -fsSL https://raw.githubusercontent.com/tshamim/erp_custom/main/scripts/backup-coolify.sh \
  -o /opt/erp-backup/backup-coolify.sh
sudo chmod 700 /opt/erp-backup/backup-coolify.sh
sudo /opt/erp-backup/backup-coolify.sh <uuid> /var/backups/erp 14     # try it once
```

Schedule it daily (`sudo crontab -e`) and copy the files off the server:

```cron
0 2 * * * /opt/erp-backup/backup-coolify.sh <uuid> /var/backups/erp 14 >> /var/log/erp-backup.log 2>&1
30 2 * * * rclone copy /var/backups/erp remote:erp-backups
```

The `env-*.bak` files contain every secret, so they are written readable by root only. Keep the
off-site copy as private as the server.

**Restore.** Find the containers with `docker ps --filter label=com.docker.compose.project=<uuid>`.

Databases:

```bash
gunzip -c /var/backups/erp/postgres-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i <postgres-container> psql -U erp -d postgres
```

Files (stop the resource in Coolify first):

```bash
docker run --rm -v <uuid>_miniodata:/data -v /var/backups/erp:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/files-YYYYMMDD-HHMMSS.tar.gz -C /data"
```

To confirm the volume name, look under **Persistent Storage** in Coolify, or run
`docker volume ls | grep miniodata`. Restoring onto a fresh resource also needs the same
`TENANT_SECRET_KEY` and `PG_ADMIN_PASSWORD` from the matching `env-*.bak`; otherwise the restored
company databases cannot be opened.

Test a restore on a spare resource before go-live.

## Day-to-day

| Task | Where |
|---|---|
| Logs | resource → **Logs**, pick the service |
| Database shell | resource → **Terminal** → `postgres` → `psql -U erp -d erp_control` |
| Re-run migrations by hand | **Redeploy**, or Terminal → `api` → `node packages/db/dist/cli/migrate-tenants.js` |
| Uptime check | point UptimeRobot or Better Stack at `https://api.example.com/health` |

> **Never delete the resource with "Delete volumes" ticked** unless you mean to destroy every
> company's data. Stopping or redeploying keeps the `pgdata` and `miniodata` volumes.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Deploy stops with *required variable … is missing a value* | That variable is empty in Coolify. Set it and redeploy. |
| Web build fails, or the app calls `localhost:4100` | `NEXT_PUBLIC_API_URL` not set, or not marked **Available at Buildtime**. Fix it and **Redeploy**. |
| `migrate` exits non-zero, API never starts | Logs → `migrate`. Usually a `PG_ADMIN_PASSWORD` changed after the first deploy: Postgres keeps the password from its first start. Set the old value back. |
| Login page shows Company ID locked to `erp` (the first part of the web domain) | `NEXT_PUBLIC_APP_DOMAIN` missing or wrong. Set it to the web hostname, tick **Available at Buildtime**, and **Redeploy**. |
| *Unknown company "…"* on the platform pages | The API domain does not start with `api.` (see [Before you start](#1-before-you-start)). |
| Browser shows "Network error" after login | `WEB_ORIGIN` does not exactly match the address in the browser (scheme included, no trailing slash). Fix and **Restart**. |
| Signed out on every reload | The web and API domains are on different registrable domains. Keep both under the same parent domain, e.g. `erp.example.com` and `api.example.com`, so the refresh cookie is sent. |
| 404 / *no available server* | Domain missing the `:3100` / `:4100` port suffix, or DNS not pointing at this server yet. |
| Certificate not issued | DNS not pointing here yet, or port 80 blocked: Let's Encrypt validates over HTTP. |

## Optional: a subdomain per company

By default staff open `https://erp.example.com/login` and type their Company ID. With a subdomain per
company, `https://acme.erp.example.com` fills in and locks the Company ID instead. It needs three
things: a wildcard DNS record, a wildcard certificate, and the API allowing those origins.

1. **DNS.** Add `*.erp` → the server's IP (an A record for `*.erp.example.com`).
   *Cloudflare:* set this record to **DNS only** (grey cloud). Cloudflare's free certificate covers one
   level (`*.example.com`), not `*.erp.example.com`, so proxying it fails with an SSL error. The
   certificate then comes from the server, in the next step.
2. **Wildcard certificate.** Let's Encrypt only issues wildcards through a DNS challenge. In Coolify:
   **Servers → (server) → Proxy**, switch the `letsencrypt` resolver from the HTTP challenge to a DNS
   challenge for your DNS provider and give Traefik the provider's API token. For Cloudflare, create a
   token with *Zone → DNS → Edit* on the zone, then in the proxy configuration replace
   `--certificatesresolvers.letsencrypt.acme.httpchallenge=true` (and its `entrypoint` line) with:

   ```yaml
   - '--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare'
   - '--certificatesresolvers.letsencrypt.acme.dnschallenge.resolvers=1.1.1.1:53'
   ```

   and add under the proxy service:

   ```yaml
   environment:
     - CF_DNS_API_TOKEN=<the token>
   ```

   Save and **Restart Proxy**. Coolify's own guide, *Wildcard SSL certificates* under Knowledge Base →
   Proxy → Traefik, has the same steps for other DNS providers and current Coolify versions.
3. **Route the subdomains to `web`.** Add `https://*.erp.example.com:3100` to the `web` service's domains,
   next to `https://erp.example.com:3100` and separated by a comma. If your Coolify version rejects a
   wildcard there, add these container labels to `web` instead:

   ```
   traefik.http.routers.erp-tenants.rule=HostRegexp(`^[a-z0-9-]+\.erp\.example\.com$`)
   traefik.http.routers.erp-tenants.entrypoints=https
   traefik.http.routers.erp-tenants.tls.certresolver=letsencrypt
   traefik.http.routers.erp-tenants.tls.domains[0].main=erp.example.com
   traefik.http.routers.erp-tenants.tls.domains[0].sans=*.erp.example.com
   traefik.http.services.erp-tenants.loadbalancer.server.port=3100
   ```
4. **Variables.** Allow the subdomains in CORS, and make email links use them:

   ```ini
   WEB_ORIGIN=https://erp.example.com,https://*.erp.example.com
   MAIL_TENANT_SUBDOMAINS=true
   ```

   One `*` matches exactly one label, so `https://*.erp.example.com` allows `acme.erp.example.com` but
   not `erp.example.com` itself, which is why both entries are needed.
5. **Restart** the resource. No rebuild is needed if `NEXT_PUBLIC_APP_DOMAIN` is already set.

Check: `https://acme.erp.example.com/login` shows the Company ID filled in as `acme` and locked, and
signing in works without a "Network error". The company must exist; its Company ID is the subdomain.

## Known limits on Coolify

* The API does not trust proxy headers, so audit-log IP addresses show the proxy's internal address
  rather than the visitor's.
* Mailpit and Redis are development-only and are not part of the Coolify stack. Redis is not used by
  the application yet.
