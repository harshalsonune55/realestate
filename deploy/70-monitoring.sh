#!/usr/bin/env bash
# Phase H — mail relay, health checks, cron-liveness monitoring.
#
# The runbook's health script pipes to `mail`, but a stock Ubuntu box has no
# MTA: every alert would vanish silently. That is the worst failure mode a
# monitoring script can have, so the relay is set up first and test-fired.
source "$(dirname "$0")/lib.sh"
require ALERT_EMAIL ODOO_DB_NAME
PHASE=post

step "mail relay"
# bsd-mailx goes on regardless of whether a relay is configured: without it
# `mail` does not exist, every alert exits 127, and the health check spews
# "command not found" instead of reporting. With it, alerts at least queue.
rroot <<'EOF'
command -v mail >/dev/null 2>&1 || \
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq bsd-mailx >/dev/null 2>&1
echo "  ok   mail command present: $(command -v mail || echo NO)"
EOF

if [[ -z "${SMTP_HOST:-}" ]]; then
  c_warn "SMTP_HOST empty — skipping relay setup. Alerts will be logged locally"
  c_warn "to /var/log/pms-alerts.log and syslog, but nothing will leave the box."
  c_warn "Fill the SMTP_* block in server.env and re-run this script."
else
  rroot <<'EOF'
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq msmtp msmtp-mta bsd-mailx >/dev/null
umask 077
cat > /etc/msmtprc <<CONF
defaults
auth           on
tls            on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile        /var/log/msmtp.log

account        pms
host           $SMTP_HOST
port           $SMTP_PORT
from           ${SMTP_FROM:-$ALERT_EMAIL}
user           $SMTP_USER
password       $SMTP_PASSWORD

account default : pms
CONF
chmod 600 /etc/msmtprc
chown root:root /etc/msmtprc
echo "  ok   /etc/msmtprc"
EOF

  step "test alert (check the inbox before trusting anything below)"
  rroot "echo 'Provisioning test from \$(hostname) at \$(date -Is).' | mail -s 'PMS: alerting test' '$ALERT_EMAIL' && tail -3 /var/log/msmtp.log | sed 's/^/       /'"
fi

step "health check script"
rroot <<'BOOT'
cat > /usr/local/bin/pms-healthcheck.sh <<CONF
#!/bin/bash
ALERT=$ALERT_EMAIL
ODOO_DB=$ODOO_DB_NAME
CONF

cat >> /usr/local/bin/pms-healthcheck.sh <<'CONF'
# Managed by deploy/70-monitoring.sh. Run hourly.
# Always leave a durable local trace first, then try to get it off the box. If
# the relay is down or absent, the record still exists somewhere you can read.
alert() {
  echo "$(date -Is) [$1] $2" >> /var/log/pms-alerts.log
  logger -t pms-health "ALERT $1: $2"
  echo "$2" | mail -s "PMS: $1" "$ALERT" 2>/dev/null || true
}

USE=$(df --output=pcent /opt | tail -1 | tr -dc 0-9)
[ "${USE:-0}" -gt 70 ] && alert "disk warning" "/opt is at ${USE}%. Filestore grows ~5GB/year; resize or prune backups."

for svc in odoo postgresql nginx; do
  systemctl is-active --quiet "$svc" || alert "$svc down" "$svc is not running on $(hostname)."
done

su -s /bin/bash pmsapp -c 'pm2 jlist' 2>/dev/null | grep -q '"status":"online"' \
  || alert "app down" "pm2 process pms-app is not online."

grep -q "$(date +%Y-%m-%d).*backup ok" /var/log/pms-backup.log 2>/dev/null \
  || alert "backup missing" "No successful backup logged today."

# Certificate expiry.
for d in $(ls /etc/letsencrypt/live 2>/dev/null | grep -v README); do
  end=$(date -d "$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$d/cert.pem" | cut -d= -f2)" +%s)
  days=$(( (end - $(date +%s)) / 86400 ))
  [ "$days" -lt 14 ] && alert "cert expiring" "$d expires in $days days; renewal timer may be broken."
done

# The one that fails silently: if Odoo's scheduler stops, nothing visibly
# breaks — you simply stop being told about cheques, which is the entire
# reason this system exists.
if systemctl is-active --quiet postgresql; then
  stale=$(sudo -u postgres psql -qtAX -d "$ODOO_DB" -c \
    "SELECT count(*) FROM ir_cron WHERE active
      AND (nextcall < now() - interval '6 hours')" 2>/dev/null || echo 0)
  [ "${stale:-0}" -gt 0 ] && alert "cron stalled" \
    "$stale active scheduled action(s) overdue by >6h. Cheque reminders may not be firing."
fi
CONF

chmod 700 /usr/local/bin/pms-healthcheck.sh

cat > /etc/cron.d/pms-healthcheck <<'CONF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 * * * * root /usr/local/bin/pms-healthcheck.sh
CONF
chmod 644 /etc/cron.d/pms-healthcheck
echo "  ok   hourly health check installed"
BOOT

step "dry run"
rroot '/usr/local/bin/pms-healthcheck.sh && echo "  ok   health check exited clean"'

echo
c_ok "Phase H done."
c_warn "Also worth watching manually: auditlog table growth (plan 12-24 month retention)"
echo "       and failed logins in /var/log/odoo/odoo.log."
