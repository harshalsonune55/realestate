#!/usr/bin/env bash
# Phase D — Odoo 18 Community as a systemd service.
source "$(dirname "$0")/lib.sh"
require ODOO_VERSION ODOO_MASTER_PASSWORD ODOO_DB_USER ODOO_DB_PASSWORD ODOO_DB_NAME ODOO_WORKERS
PHASE=post

[[ "${ODOO_WORKERS:-0}" -gt 0 ]] || {
  c_err "ODOO_WORKERS=$ODOO_WORKERS — with 0 workers Odoo never runs a scheduled action."
  c_err "Every cheque reminder in this system depends on that integer. Refusing."
  exit 1
}

step "system user and directories"
rroot <<'EOF'
id -u odoo >/dev/null 2>&1 || adduser --system --home=/opt/odoo --group odoo
install -d -o odoo -g odoo /opt/odoo /opt/odoo/custom /opt/odoo/oca /opt/odoo/filestore /var/log/odoo
EOF

step "build dependencies"
rroot <<'EOF'
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  python3-venv python3-dev build-essential libxml2-dev libxslt1-dev \
  libldap2-dev libsasl2-dev libpq-dev libjpeg-dev zlib1g-dev git curl \
  node-less xfonts-75dpi xfonts-base fontconfig >/dev/null
echo "  ok   $(python3 --version)"
EOF

step "wkhtmltopdf (patched Qt build — the distro package renders headers wrong)"
rroot <<'EOF'
if wkhtmltopdf --version 2>/dev/null | grep -q "with patched qt"; then
  echo "  ok   $(wkhtmltopdf --version)"
else
  . /etc/os-release
  base=https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3
  arch=$(dpkg --print-architecture)
  ok=0
  # No noble build is published upstream; the jammy package works on 24.04.
  for code in "$VERSION_CODENAME" jammy; do
    url="$base/wkhtmltox_0.12.6.1-3.${code}_${arch}.deb"
    if curl -fsSL -o /tmp/wkhtmltox.deb "$url" 2>/dev/null; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/wkhtmltox.deb >/dev/null && ok=1 && break
    fi
  done
  rm -f /tmp/wkhtmltox.deb
  if [ "$ok" = 1 ]; then
    echo "  ok   $(wkhtmltopdf --version)"
  else
    echo "warn   wkhtmltopdf not installed — QWeb PDF reports (contracts, receipts,"
    echo "       owner statements) will fail. Install manually before go-live."
  fi
fi
EOF

step "source + virtualenv (this takes several minutes)"
rroot <<'EOF'
if [ ! -d /opt/odoo/odoo/.git ]; then
  sudo -u odoo git clone https://github.com/odoo/odoo.git \
    --depth 1 --branch "$ODOO_VERSION" /opt/odoo/odoo
else
  sudo -u odoo git -C /opt/odoo/odoo fetch --depth 1 origin "$ODOO_VERSION"
  sudo -u odoo git -C /opt/odoo/odoo reset --hard FETCH_HEAD
fi

[ -x /opt/odoo/venv/bin/python3 ] || sudo -u odoo python3 -m venv /opt/odoo/venv
sudo -u odoo /opt/odoo/venv/bin/pip install --quiet --upgrade pip wheel setuptools
sudo -u odoo /opt/odoo/venv/bin/pip install --quiet -r /opt/odoo/odoo/requirements.txt
echo "  ok   odoo $(sudo -u odoo git -C /opt/odoo/odoo rev-parse --short HEAD)"
EOF

step "/etc/odoo.conf"
rroot <<'EOF'
umask 077
# The runbook's flat 1GB soft / 1.28GB hard per worker assumes the 8GB box in
# Phase A.1. Sized above real RAM the kernel OOM-kills workers mid-request
# instead of Odoo recycling them cleanly. Derive, capped at the runbook values.
ram_b=$(( $(awk '/^MemTotal:/{print $2}' /proc/meminfo) * 1024 ))
soft=$(( ram_b * 35 / 100 )); [ "$soft" -gt 1073741824 ] && soft=1073741824
hard=$(( soft * 5 / 4 ))
cat > /etc/odoo.conf <<CONF
[options]
admin_passwd = $ODOO_MASTER_PASSWORD
db_host = localhost
db_port = 5432
db_user = $ODOO_DB_USER
db_password = $ODOO_DB_PASSWORD
db_maxconn = 64

# Hides the database selector and restricts serving to one database. Without
# these, the database name is public and the manager is reachable.
list_db = False
dbfilter = ^${ODOO_DB_NAME}\$

addons_path = /opt/odoo/odoo/addons,/opt/odoo/oca,/opt/odoo/custom
data_dir = /opt/odoo/filestore
logfile = /var/log/odoo/odoo.log
log_level = info

# Loopback only — unreachable except through Nginx.
http_interface = 127.0.0.1
http_port = 8069
gevent_port = 8072
proxy_mode = True

workers = $ODOO_WORKERS
max_cron_threads = 2
limit_memory_soft = $soft
limit_memory_hard = $hard
limit_request = 8192
limit_time_cpu = 300
limit_time_real = 600
# Reconciliation cron scans every cheque; the 300s default kills it mid-run.
limit_time_real_cron = 900
CONF
chown odoo:odoo /etc/odoo.conf
chmod 640 /etc/odoo.conf
ls -l /etc/odoo.conf | sed 's/^/       /'
EOF

step "systemd unit"
rroot <<'EOF'
cat > /etc/systemd/system/odoo.service <<'CONF'
[Unit]
Description=Odoo 18 Community
Requires=postgresql.service
After=network.target postgresql.service

[Service]
Type=simple
User=odoo
Group=odoo
ExecStart=/opt/odoo/venv/bin/python3 /opt/odoo/odoo/odoo-bin -c /etc/odoo.conf
KillMode=mixed
Restart=on-failure
RestartSec=5

# Odoo only ever writes to these; everything else on the box is read-only to it.
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths=/opt/odoo/filestore /var/log/odoo

[Install]
WantedBy=multi-user.target
CONF

systemctl daemon-reload
systemctl enable --now odoo
sleep 8
systemctl is-active --quiet odoo \
  && echo "  ok   odoo running, $(pgrep -c -u odoo -f odoo-bin) process(es)" \
  || { journalctl -u odoo -n 30 --no-pager; exit 1; }

ss -ltn | grep -q '127.0.0.1:8069' \
  && echo "  ok   listening on 127.0.0.1:8069 only" \
  || echo "warn   8069 not bound to loopback — check http_interface"
EOF

step "log rotation"
rroot <<'EOF'
cat > /etc/logrotate.d/odoo <<'CONF'
/var/log/odoo/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 odoo odoo
    sharedscripts
    postrotate
        systemctl reload odoo > /dev/null 2>&1 || true
    endscript
}
CONF
logrotate -d /etc/logrotate.d/odoo >/dev/null 2>&1 && echo "  ok   logrotate config valid"
EOF

echo
c_ok "Phase D done."
c_warn "The '$ODOO_DB_NAME' database does not exist yet. With list_db=False the web"
echo "       installer is hidden, so create it once from the CLI:"
echo
echo "  ssh -p $SSH_PORT_FINAL $DEPLOY_USER@$SSH_HOST \\"
echo "    'sudo systemctl stop odoo && sudo -u odoo /opt/odoo/venv/bin/python3 \\"
echo "     /opt/odoo/odoo/odoo-bin -c /etc/odoo.conf -d $ODOO_DB_NAME -i base --stop-after-init \\"
echo "     && sudo systemctl start odoo'"
