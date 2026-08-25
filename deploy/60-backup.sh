#!/usr/bin/env bash
# Phase G — nightly backups, offsite copy, WAL pruning, restore drill.
#
# Fix vs the runbook: its prune line was
#   find /var/backups/pms -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
# which matches the parent directory itself. The day nothing new is written,
# /var/backups/pms ages past 14 days and the job deletes every backup you have.
# -mindepth 1 below.
source "$(dirname "$0")/lib.sh"
require ODOO_DB_NAME APP_DB_NAME ALERT_EMAIL BACKUP_RETAIN_DAYS
PHASE=post

step "rclone"
rroot <<'EOF'
command -v rclone >/dev/null || { DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rclone >/dev/null; }
if rclone listremotes 2>/dev/null | grep -q "^${RCLONE_REMOTE}:"; then
  echo "  ok   remote '$RCLONE_REMOTE' configured"
else
  echo "warn   rclone remote '$RCLONE_REMOTE' not configured — backups stay LOCAL ONLY."
  echo "       A local-only backup does not survive losing the server. Run 'rclone config'"
  echo "       as root, with a write-only credential and bucket versioning ON."
fi
EOF

step "backup script"
rroot <<'BOOT'
install -d -m 700 /var/backups/pms

cat > /usr/local/bin/pms-backup.sh <<CONF
#!/bin/bash
# Managed by deploy/60-backup.sh
set -euo pipefail

ODOO_DB=$ODOO_DB_NAME
APP_DB=$APP_DB_NAME
REMOTE=$RCLONE_REMOTE
RPATH=$RCLONE_PATH
RETAIN=$BACKUP_RETAIN_DAYS
ALERT=$ALERT_EMAIL
CONF

cat >> /usr/local/bin/pms-backup.sh <<'CONF'

STAMP=$(date +%Y%m%d-%H%M)
DEST=/var/backups/pms/$STAMP
mkdir -p "$DEST"

fail() { echo "$(date -Is) backup FAILED at: $1" >> /var/log/pms-backup.log
         echo "PMS backup failed at: $1" | mail -s "PMS BACKUP FAILED" "$ALERT" || true
         exit 1; }
trap 'fail "${BASH_COMMAND}"' ERR

# Database and filestore must be captured together. A database restored against
# a filestore you do not have looks healthy until someone opens a cheque scan.
sudo -u postgres pg_dump -Fc "$ODOO_DB" > "$DEST/odoo.dump"
sudo -u postgres pg_dump -Fc "$APP_DB"  > "$DEST/app.dump"
tar czf "$DEST/filestore.tar.gz" -C /opt/odoo filestore
tar czf "$DEST/appdata.tar.gz"   -C /opt/pms-app data 2>/dev/null || true

cp /etc/odoo.conf                      "$DEST/odoo.conf"
# Best-effort, like the app env below: these are reproducible from deploy/, and
# a missing one must never abort a run that already captured the real payload.
cp /etc/nginx/sites-available/pms      "$DEST/nginx-pms.conf" 2>/dev/null || true
cp /opt/pms-app/.env.production        "$DEST/app.env" 2>/dev/null || true

sha256sum "$DEST"/* > "$DEST/SHA256SUMS"

# Refuse to call it a success if the filestore archive is suspiciously empty.
sz=$(stat -c %s "$DEST/filestore.tar.gz")
[ "$sz" -gt 1024 ] || fail "filestore archive is only ${sz} bytes"

if rclone listremotes 2>/dev/null | grep -q "^${REMOTE}:"; then
  rclone copy "$DEST" "${REMOTE}:${RPATH}/${STAMP}" --transfers 4
else
  echo "$(date -Is) WARNING no rclone remote; local copy only" >> /var/log/pms-backup.log
fi

# -mindepth 1 so the parent is never a candidate for deletion.
find /var/backups/pms -mindepth 1 -maxdepth 1 -type d -mtime "+$RETAIN" -exec rm -rf {} +
# WAL archive would otherwise grow forever.
find /var/backups/wal -mindepth 1 -type f -mtime +7 -delete

trap - ERR
echo "$(date -Is) backup ok $STAMP $(du -sh "$DEST" | cut -f1)" >> /var/log/pms-backup.log
CONF

chmod 700 /usr/local/bin/pms-backup.sh
touch /var/log/pms-backup.log && chmod 640 /var/log/pms-backup.log

cat > /etc/logrotate.d/pms-backup <<'CONF'
/var/log/pms-backup.log { weekly rotate 26 compress missingok notifempty }
CONF
echo "  ok   /usr/local/bin/pms-backup.sh"
BOOT

step "schedule (02:00 Asia/Dubai)"
rroot <<'EOF'
cat > /etc/cron.d/pms-backup <<'CONF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * root /usr/local/bin/pms-backup.sh
CONF
chmod 644 /etc/cron.d/pms-backup
echo "  ok   /etc/cron.d/pms-backup"
EOF

step "first run (proves it works before you depend on it)"
rroot 'test -d /opt/odoo/filestore && /usr/local/bin/pms-backup.sh && tail -3 /var/log/pms-backup.log | sed "s/^/       /"'

step "restore drill helper"
rroot <<'EOF'
cat > /usr/local/bin/pms-restore-test.sh <<'CONF'
#!/bin/bash
# Quarterly drill. Restores the newest dump into a scratch database and checks
# it is actually populated, then drops it. An untested backup is a hypothesis.
set -euo pipefail
STAMP=${1:-$(ls -1 /var/backups/pms | sort | tail -1)}
SRC=/var/backups/pms/$STAMP
echo "restoring $SRC"
(cd "$SRC" && sha256sum -c SHA256SUMS)

sudo -u postgres dropdb --if-exists restore_test
sudo -u postgres createdb restore_test

# /var/backups/pms is 0700 root, so the postgres user cannot read the dump in
# place — pg_restore fails with EACCES and leaves an empty database behind.
# Stage it somewhere postgres can actually reach.
TMP=$(mktemp -d /tmp/pms-restore.XXXXXX)
chmod 711 "$TMP"
install -m 644 "$SRC/odoo.dump" "$TMP/odoo.dump"
sudo -u postgres pg_restore -d restore_test "$TMP/odoo.dump" 2>&1 | tail -5 || true
rm -rf "$TMP"

rows=$(sudo -u postgres psql -qtAX -d restore_test -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "restored tables: $rows"

# A drill that reports success having restored nothing is worse than no drill.
if [ "$rows" -lt 50 ]; then
  echo "DRILL FAILED: only $rows tables restored — this backup is not restorable."
  sudo -u postgres dropdb --if-exists restore_test
  exit 1
fi

echo "filestore entries: $(tar tzf "$SRC/filestore.tar.gz" | wc -l)"
echo
echo "Manual checks before calling this a pass:"
echo "  - open a cheque scan from the restored filestore"
echo "  - trial balance matches the source system"
echo "  - audit entries are present"
sudo -u postgres dropdb restore_test
CONF
chmod 700 /usr/local/bin/pms-restore-test.sh
echo "  ok   /usr/local/bin/pms-restore-test.sh"
EOF

echo
c_ok "Phase G done."
c_warn "Put the quarterly restore drill in a calendar now: pms-restore-test.sh"
