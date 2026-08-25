#!/usr/bin/env bash
# The go-live checklist, executed rather than read. Read-only.
# Exit code is the number of failed checks.
source "$(dirname "$0")/lib.sh"
PHASE=post
FAILED=0

chk() { # chk "description" "remote test command"
  if rsh "$2" >/dev/null 2>&1; then c_ok "$1"; else c_err "$1"; FAILED=$((FAILED+1)); fi
}

step "access"
chk "SSH on $SSH_PORT_FINAL, keys only"        "sudo sshd -T | grep -q 'passwordauthentication no'"
chk "root login disabled"                       "sudo sshd -T | grep -q 'permitrootlogin no'"
chk "ufw active"                                "sudo ufw status | grep -q '^Status: active'"
chk "fail2ban running"                          "systemctl is-active --quiet fail2ban"
chk "8069 not reachable externally"             "! sudo ufw status | grep -qE '^8069'"
chk "8072 not reachable externally"             "! sudo ufw status | grep -qE '^8072'"

step "postgres"
chk "odoo role is NOT superuser"                "[ \"\$(sudo -u postgres psql -qtAX -c \"SELECT rolsuper FROM pg_roles WHERE rolname='$ODOO_DB_USER'\")\" = f ]"
chk "app role is NOT superuser"                 "[ \"\$(sudo -u postgres psql -qtAX -c \"SELECT rolsuper FROM pg_roles WHERE rolname='$APP_DB_USER'\")\" = f ]"
chk "wal_level = replica"                       "sudo -u postgres psql -qtAX -c 'SHOW wal_level' | grep -q replica"
chk "archive_mode = on"                         "sudo -u postgres psql -qtAX -c 'SHOW archive_mode' | grep -q on"
chk "WAL archiver has no failures"              "[ \"\$(sudo -u postgres psql -qtAX -c 'SELECT failed_count FROM pg_stat_archiver')\" = 0 ]"

step "odoo"
chk "odoo.conf is 640, owned by odoo"           "[ \"\$(stat -c '%a %U' /etc/odoo.conf)\" = '640 odoo' ]"
chk "list_db = False"                           "sudo grep -q '^list_db *= *False' /etc/odoo.conf"
chk "dbfilter set"                              "sudo grep -q '^dbfilter *= *\\^' /etc/odoo.conf"
chk "workers > 0"                               "[ \"\$(sudo grep -oP '^workers *= *\\K[0-9]+' /etc/odoo.conf)\" -gt 0 ]"
chk "odoo bound to loopback only"               "ss -ltn | grep -q '127.0.0.1:8069'"
chk "odoo service active"                       "systemctl is-active --quiet odoo"
chk "wkhtmltopdf has patched qt"                "wkhtmltopdf --version | grep -q 'patched qt'"

step "a scheduled action has actually fired"
if rsh "sudo -u postgres psql -qtAX -d '$ODOO_DB_NAME' -c \"SELECT count(*) FROM ir_cron WHERE active AND lastcall IS NOT NULL\" 2>/dev/null | grep -qvE '^0?$'"; then
  c_ok "at least one cron has run (workers are genuinely processing)"
else
  c_err "no scheduled action has ever run — this is the failure the whole system exists to prevent"
  FAILED=$((FAILED+1))
fi

step "web"
chk "/web/database/manager returns 404"         "[ \"\$(curl -s -o /dev/null -w '%{http_code}' https://$ERP_DOMAIN/web/database/manager)\" = 404 ]"
chk "HSTS header present"                       "curl -sI https://$ERP_DOMAIN | grep -qi strict-transport-security"
chk "erp responds over TLS"                     "curl -sf -o /dev/null https://$ERP_DOMAIN/web/login"
chk "app responds over TLS"                     "curl -s -o /dev/null -w '%{http_code}' https://$APP_DOMAIN | grep -qE '200|302|307'"
chk "http redirects to https"                   "[ \"\$(curl -s -o /dev/null -w '%{http_code}' http://$ERP_DOMAIN)\" = 301 ]"
chk "certbot renewal timer armed"               "systemctl list-timers --all | grep -qi certbot"

step "app"
chk "pm2 pms-app online"                        "su -s /bin/bash pmsapp -c 'pm2 jlist' | grep -q '\"status\":\"online\"'"
chk ".env.production is 600"                    "[ \"\$(stat -c '%a' /opt/pms-app/.env.production)\" = 600 ]"
chk "PMS_DATA_DIR outside the git checkout"     "sudo grep -q 'PMS_DATA_DIR=/opt/pms-app/data' /opt/pms-app/.env.production"
chk "access gate enabled"                       "sudo grep -qE '^PMS_ACCESS_PASSWORD=.+' /opt/pms-app/.env.production"

step "backup"
chk "backup cron installed"                     "[ -f /etc/cron.d/pms-backup ]"
# sudo: the log is 640 root:root, so an unprivileged grep reports a missing
# backup that actually ran — a false alarm on the one thing you must trust.
chk "a backup succeeded today"                  "sudo grep -q \"\$(date +%Y-%m-%d).*backup ok\" /var/log/pms-backup.log"
chk "filestore included in newest backup"       "ls -1 /var/backups/pms | sort | tail -1 | xargs -I{} sudo test -s /var/backups/pms/{}/filestore.tar.gz"
chk "offsite remote configured"                 "sudo rclone listremotes | grep -q '^$RCLONE_REMOTE:'"
# 700 root:root, so test -x is false for the deploy user even when it exists.
chk "restore drill script present"              "sudo test -x /usr/local/bin/pms-restore-test.sh"

step "monitoring"
chk "health check cron installed"               "[ -f /etc/cron.d/pms-healthcheck ]"
chk "mail relay configured"                     "[ -f /etc/msmtprc ]"
chk "timezone is $TZ"                           "[ \"\$(timedatectl show -p Timezone --value)\" = '$TZ' ]"

step "manual — not machine-checkable"
cat <<'NOTE'
       [ ] Restore tested into a scratch DB, cheque scan opened, trial balance matched
       [ ] Odoo admin password changed from the install default
       [ ] API user is NOT admin; scoped to required groups only
       [ ] Accounting lock date set after the first month close
       [ ] Odoo company timezone set to Asia/Dubai (separate from the server clock)
       [ ] Staging outgoing mail disabled and mail servers deactivated
       [ ] Data residency confirmed with the company (UAE Decree-Law 45/2021)
       [ ] Demo data purged: app pages still read src/lib/store.ts, not Postgres
NOTE

echo
if [[ $FAILED -eq 0 ]]; then
  c_ok "all automated checks passed"
else
  c_err "$FAILED check(s) failed"
fi
exit "$FAILED"
