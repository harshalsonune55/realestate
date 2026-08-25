#!/usr/bin/env bash
# Phase C — PostgreSQL 16, roles, tuning, WAL archiving.
#
# Two roles, not one. Odoo gets CREATEDB (it needs it); the Next.js app gets a
# plain role that owns only its own database. Neither is superuser — the earlier
# runbook's `createuser -s odoo` made an Odoo compromise a full-cluster
# compromise.
source "$(dirname "$0")/lib.sh"
require ODOO_DB_USER ODOO_DB_PASSWORD APP_DB_NAME APP_DB_USER APP_DB_PASSWORD
PHASE=post

step "install"
rroot <<'EOF'
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-client >/dev/null
pg_lsclusters | sed 's/^/       /'
EOF

step "roles and app database"
rroot <<'EOF'
psql_su() { sudo -u postgres psql -v ON_ERROR_STOP=1 -qtAX "$@"; }

# -d -R -S : createdb yes, createrole no, superuser no.
if [ -z "$(psql_su -c "SELECT 1 FROM pg_roles WHERE rolname='$ODOO_DB_USER'")" ]; then
  sudo -u postgres createuser -d -R -S "$ODOO_DB_USER"
fi
psql_su -c "ALTER ROLE $ODOO_DB_USER WITH PASSWORD '$ODOO_DB_PASSWORD'"

if [ -z "$(psql_su -c "SELECT 1 FROM pg_roles WHERE rolname='$APP_DB_USER'")" ]; then
  sudo -u postgres createuser -D -R -S "$APP_DB_USER"
fi
psql_su -c "ALTER ROLE $APP_DB_USER WITH PASSWORD '$APP_DB_PASSWORD'"

# The Next.js app's own database (db/001_init.sql). Odoo creates its own on
# first run through the web installer.
if [ -z "$(psql_su -c "SELECT 1 FROM pg_database WHERE datname='$APP_DB_NAME'")" ]; then
  sudo -u postgres createdb -O "$APP_DB_USER" "$APP_DB_NAME"
fi

for r in "$ODOO_DB_USER" "$APP_DB_USER"; do
  printf '       %-8s superuser=%s createdb=%s\n' "$r" \
    "$(psql_su -c "SELECT rolsuper FROM pg_roles WHERE rolname='$r'")" \
    "$(psql_su -c "SELECT rolcreatedb FROM pg_roles WHERE rolname='$r'")"
done
EOF

step "tuning for 8 GB + WAL archiving"
rroot <<'EOF'
ver=$(pg_lsclusters -h | awk 'NR==1{print $1}')
conf="/etc/postgresql/$ver/main/conf.d/10-pms.conf"
mkdir -p "$(dirname "$conf")"

install -d -o postgres -g postgres -m 750 /var/backups/wal

# The runbook's flat 2GB/6GB assumes the 8GB box in Phase A.1. On anything
# smaller, shared_buffers > RAM means postgres cannot map its shared memory and
# refuses to start. Derive from the real machine, capped at the runbook values.
ram_mb=$(awk '/^MemTotal:/{print int($2/1024)}' /proc/meminfo)
shared_mb=$(( ram_mb / 4 ));   [ "$shared_mb" -gt 2048 ] && shared_mb=2048
cache_mb=$(( ram_mb * 3 / 4 )); [ "$cache_mb" -gt 6144 ] && cache_mb=6144
work_mb=$(( ram_mb / 64 ));    [ "$work_mb" -gt 16 ] && work_mb=16; [ "$work_mb" -lt 1 ] && work_mb=1
maint_mb=$(( ram_mb / 16 ));   [ "$maint_mb" -gt 512 ] && maint_mb=512; [ "$maint_mb" -lt 32 ] && maint_mb=32
echo "       ${ram_mb}M RAM -> shared_buffers=${shared_mb}MB effective_cache_size=${cache_mb}MB"

cat > "$conf" <<CONF
# Managed by deploy/20-postgres.sh — Phase C.2 (sized for ${ram_mb}M RAM)
shared_buffers = ${shared_mb}MB
effective_cache_size = ${cache_mb}MB
work_mem = ${work_mb}MB
maintenance_work_mem = ${maint_mb}MB
max_connections = 100
random_page_cost = 1.1

# Point-in-time recovery (Phase G). Both need a restart to change, so they go
# in now rather than after the data matters.
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/backups/wal/%f && cp %p /var/backups/wal/%f'

log_min_duration_statement = 2000
CONF

chown postgres:postgres "$conf"
systemctl restart postgresql
sleep 3

sudo -u postgres psql -qtAX -c \
  "SELECT name||' = '||setting FROM pg_settings
    WHERE name IN ('shared_buffers','wal_level','archive_mode','max_connections')" \
  | sed 's/^/       /'
EOF

step "WAL archive is actually working"
rroot <<'EOF'
sudo -u postgres psql -qtAX -c "SELECT pg_switch_wal()" >/dev/null
sleep 3
n=$(find /var/backups/wal -type f | wc -l)
if [ "$n" -gt 0 ]; then
  echo "  ok   $n WAL segment(s) archived"
else
  echo "warn   nothing in /var/backups/wal — check archive_command and disk perms"
  sudo -u postgres psql -qtAX -c "SELECT last_failed_wal, last_failed_time FROM pg_stat_archiver"
fi
EOF

echo
c_ok "Phase C done."
c_warn "/var/backups/wal grows without bound. 60-backup.sh adds the prune job."
