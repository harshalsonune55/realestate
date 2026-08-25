#!/usr/bin/env bash
# Phase E — Nginx reverse proxy and TLS.
#
# Ordering fix vs the runbook: it writes a `listen 443 ssl` vhost and runs
# `nginx -t` *before* certbot has issued anything. With no ssl_certificate the
# test fails and nginx will not reload. So we bring up an HTTP-only vhost first,
# let certbot solve HTTP-01 against it, then install the real TLS config.
source "$(dirname "$0")/lib.sh"
require ERP_DOMAIN APP_DOMAIN CERTBOT_EMAIL
PHASE=post

step "dns must already point here"
server_ip=$(rsh "curl -fsS --max-time 10 https://api.ipify.org")
fail=0
for d in "$ERP_DOMAIN" "$APP_DOMAIN"; do
  got=$(dig +short A "$d" | tail -1)
  [[ "$got" == "$server_ip" ]] && c_ok "$d -> $got" || { c_err "$d -> ${got:-NXDOMAIN} (want $server_ip)"; fail=1; }
done
[[ $fail -eq 0 ]] || { c_err "certbot's HTTP-01 challenge will fail. Fix DNS first."; exit 1; }

step "install"
rroot <<'EOF'
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx >/dev/null
rm -f /etc/nginx/sites-enabled/default
EOF

step "stage 1 — HTTP-only vhost so certbot can validate"
rroot <<'EOF'
cat > /etc/nginx/sites-available/pms <<CONF
server {
    listen 80;
    server_name $ERP_DOMAIN $APP_DOMAIN;
    root /var/www/html;
    location /.well-known/acme-challenge/ { allow all; }
    location / { return 200 'provisioning'; add_header Content-Type text/plain; }
}
CONF
ln -sf /etc/nginx/sites-available/pms /etc/nginx/sites-enabled/pms
nginx -t && systemctl reload nginx
echo "  ok   http vhost live"
EOF

step "certificates"
rroot <<'EOF'
certbot certonly --nginx --non-interactive --agree-tos \
  -m "$CERTBOT_EMAIL" -d "$ERP_DOMAIN" -d "$APP_DOMAIN" \
  --keep-until-expiring
certbot certificates | sed 's/^/       /'
EOF

step "stage 2 — full TLS config"
rroot <<'EOF'
LIVE=/etc/letsencrypt/live/$ERP_DOMAIN
[ -f "$LIVE/fullchain.pem" ] || { echo "no cert at $LIVE"; exit 1; }

cat > /etc/nginx/sites-available/pms <<CONF
# Managed by deploy/40-nginx.sh
upstream odoo     { server 127.0.0.1:8069; }
upstream odoochat { server 127.0.0.1:8072; }
upstream nextapp  { server 127.0.0.1:3000; }

server {
    listen 80;
    server_name $ERP_DOMAIN $APP_DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; allow all; }
    location / { return 301 https://\$host\$request_uri; }
}

# ---------- Odoo back office ----------
server {
    listen 443 ssl;
    http2 on;                          # 'listen ... http2' is deprecated in 1.25+
    server_name $ERP_DOMAIN;

    ssl_certificate     $LIVE/fullchain.pem;
    ssl_certificate_key $LIVE/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 25M;          # cheque scans, contract PDFs

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 720s;
    proxy_connect_timeout 720s;
    proxy_send_timeout 720s;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;

    # Unreachable even if admin_passwd leaks.
    location ~* ^/web/database/(manager|selector|create|duplicate|drop|backup|restore) {
        return 404;
    }

    location /websocket {
        proxy_pass http://odoochat;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location ~* /web/static/ {
        proxy_pass http://odoo;
        proxy_cache_valid 200 60m;
        expires 864000;
    }

    location / {
        proxy_pass http://odoo;
        proxy_redirect off;
    }

    gzip on;
    gzip_types text/css text/plain application/json application/javascript;
}

# ---------- Next.js staff app ----------
server {
    listen 443 ssl;
    http2 on;
    server_name $APP_DOMAIN;

    ssl_certificate     $LIVE/fullchain.pem;
    ssl_certificate_key $LIVE/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 25M;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;

    location / {
        proxy_pass http://nextapp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
CONF

nginx -t && systemctl reload nginx
echo "  ok   tls vhosts live"

systemctl list-timers --no-pager | grep -i certbot | sed 's/^/       /' || \
  echo "warn   no certbot renewal timer found"
EOF

step "renewal dry run"
rroot 'certbot renew --dry-run 2>&1 | tail -5 | sed "s/^/       /"'

echo
c_ok "Phase E done — https://$ERP_DOMAIN and https://$APP_DOMAIN"
c_warn "The app vhost 502s until 50-app.sh puts something on :3000. Expected."
