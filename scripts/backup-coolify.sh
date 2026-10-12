#!/usr/bin/env bash
# Backs up a Coolify-deployed instance: every database (control plus one per company), the uploaded
# files and the API's environment (which holds TENANT_SECRET_KEY). Run it on the Coolify server.
#
#   ./scripts/backup-coolify.sh <coolify-resource-uuid> [backup-dir] [keep-days]
#
# The resource UUID is the random id in the resource's Coolify URL; Coolify uses it as the compose
# project name, so containers carry the label com.docker.compose.project=<uuid>.
#
# Cron, 2am daily:
#   0 2 * * * /opt/erp-backup/backup-coolify.sh <uuid> /var/backups/erp 14 >> /var/log/erp-backup.log 2>&1
set -euo pipefail

PROJECT="${1:?usage: backup-coolify.sh <coolify-resource-uuid> [backup-dir] [keep-days]}"
DIR="${2:-/var/backups/erp}"
KEEP_DAYS="${3:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

container() {
  local id
  id="$(docker ps -q \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=$1" | head -n1)"
  [ -n "$id" ] || { echo "no running '$1' container for project $PROJECT" >&2; exit 1; }
  echo "$id"
}

PG="$(container postgres)"
MINIO="$(container minio)"
API="$(container api)"
PG_USER="$(docker exec "$PG" printenv POSTGRES_USER)"

mkdir -p "$DIR"
umask 077
echo "[$(date -Is)] backup started → $DIR"

# One dump holds the control database and every company database, plus roles.
docker exec "$PG" pg_dumpall -U "$PG_USER" --clean --if-exists | gzip > "$DIR/postgres-$STAMP.sql.gz"
echo "  databases: $(du -h "$DIR/postgres-$STAMP.sql.gz" | cut -f1)"

# Attachments live in MinIO's /data volume; read it straight from the volume.
VOLUME="$(docker inspect "$MINIO" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
docker run --rm -v "$VOLUME:/data:ro" -v "$DIR:/backup" alpine \
  tar czf "/backup/files-$STAMP.tar.gz" -C /data .
echo "  files: $(du -h "$DIR/files-$STAMP.tar.gz" | cut -f1)"

# The environment, including TENANT_SECRET_KEY: without it the restored company databases cannot be opened.
docker inspect "$API" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$DIR/env-$STAMP.bak"

find "$DIR" -name 'postgres-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
find "$DIR" -name 'files-*.tar.gz'    -mtime "+$KEEP_DAYS" -delete
find "$DIR" -name 'env-*.bak'         -mtime "+$KEEP_DAYS" -delete

echo "[$(date -Is)] backup finished; keeping $KEEP_DAYS days"
echo "Copy these off this server — a backup that only exists on the same machine is not a backup."
