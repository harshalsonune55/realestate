#!/usr/bin/env bash
# Phase F — the Next.js staff app under pm2.
#
# Two deviations from the runbook, both forced by what the code actually does:
#
#  1. Node 22, not 20. .node-version pins 22.18.0.
#  2. The env block is DATABASE_URL / GROQ_API_KEY / PMS_*, not ODOO_*. Nothing
#     in src/ reads an ODOO_ variable — there is no Odoo integration in this
#     repo. See the go-live warning at the bottom.
source "$(dirname "$0")/lib.sh"
require APP_REPO APP_DB_NAME APP_DB_USER APP_DB_PASSWORD
PHASE=post

step "node 22 + pm2"
rroot <<'EOF'
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
fi
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null 2>&1
echo "  ok   node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"
EOF

step "service account + checkout"
rroot <<'EOF'
id -u pmsapp >/dev/null 2>&1 || adduser --system --home=/opt/pms-app --group pmsapp
install -d -o pmsapp -g pmsapp /opt/pms-app /opt/pms-app/data

if [ -d /opt/pms-app/.git ]; then
  sudo -u pmsapp git -C /opt/pms-app fetch origin "$APP_BRANCH"
  sudo -u pmsapp git -C /opt/pms-app reset --hard "origin/$APP_BRANCH"
else
  sudo -u pmsapp git clone --branch "$APP_BRANCH" "$APP_REPO" /opt/pms-app
fi
echo "  ok   $(sudo -u pmsapp git -C /opt/pms-app log -1 --oneline)"
EOF

step "environment"
rroot <<'EOF'
umask 077
cat > /opt/pms-app/.env.production <<CONF
# Managed by deploy/50-app.sh
NODE_ENV=production
PORT=3000

# Postgres schema lives in db/001_init.sql. NOTE: nothing in src/ imports
# src/lib/db.ts yet — see the go-live warning.
DATABASE_URL=postgresql://$APP_DB_USER:$APP_DB_PASSWORD@127.0.0.1:5432/$APP_DB_NAME
DATABASE_SSL=false

# Persistent path for the JSON store (src/lib/store.ts). Must NOT be inside the
# git checkout, or a deploy wipes the data.
PMS_DATA_DIR=/opt/pms-app/data

# Site-wide gate (src/middleware.ts). Empty disables it.
PMS_ACCESS_PASSWORD=$PMS_ACCESS_PASSWORD

# Server-side only; proxied by /api/assistant, never sent to the browser.
# ASSISTANT_PROVIDER pins "openai" or "groq" (src/lib/llm.ts).
ASSISTANT_PROVIDER=$ASSISTANT_PROVIDER
OPENAI_API_KEY=$OPENAI_API_KEY
GROQ_API_KEY=$GROQ_API_KEY
GROQ_MODEL=$GROQ_MODEL
CONF
chown pmsapp:pmsapp /opt/pms-app/.env.production
chmod 600 /opt/pms-app/.env.production
ls -l /opt/pms-app/.env.production | sed 's/^/       /'
EOF

step "database schema"
rroot <<'EOF'
if [ -f /opt/pms-app/db/001_init.sql ]; then
  tables=$(sudo -u postgres psql -qtAX -d "$APP_DB_NAME" -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  if [ "$tables" -eq 0 ]; then
    PGPASSWORD="$APP_DB_PASSWORD" psql -h 127.0.0.1 -U "$APP_DB_USER" \
      -d "$APP_DB_NAME" -v ON_ERROR_STOP=1 -qf /opt/pms-app/db/001_init.sql
    echo "  ok   schema applied"
  else
    echo "  ok   schema already present ($tables tables) — not re-running"
  fi
fi
EOF

step "build"
rroot <<'EOF'
cd /opt/pms-app
sudo -u pmsapp npm ci --silent
sudo -u pmsapp env $(grep -v '^#' .env.production | xargs) npm run build
echo "  ok   build complete"
EOF

step "demo data — do not ship a seeded store"
rroot <<'EOF'
# src/lib/store.ts regenerates a full fake dataset whenever db.json is missing,
# so an empty data dir is not a clean slate: the first page view creates one.
if [ -f /opt/pms-app/data/db.json ]; then
  n=$(python3 -c "import json;d=json.load(open('/opt/pms-app/data/db.json'));print(len(d.get('units',[])))" 2>/dev/null || echo '?')
  echo "warn   /opt/pms-app/data/db.json exists with $n unit(s)."
  echo "       If this is demo data, stop the app and delete it before real use."
else
  echo "warn   no db.json yet — it will be GENERATED WITH DEMO DATA on first request."
fi
# Never let a stale checkout copy shadow the persistent dir.
rm -rf /opt/pms-app/.data
EOF

step "pm2"
rroot <<'EOF'
cd /opt/pms-app
sudo -u pmsapp pm2 delete pms-app >/dev/null 2>&1 || true
sudo -u pmsapp pm2 start npm --name pms-app --cwd /opt/pms-app -- start
sudo -u pmsapp pm2 save
env PATH="$PATH" pm2 startup systemd -u pmsapp --hp /opt/pms-app >/dev/null
systemctl enable --now pm2-pmsapp >/dev/null 2>&1 || true
sleep 6
sudo -u pmsapp pm2 list | sed 's/^/       /'

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/ || echo 000)
echo "       localhost:3000 -> HTTP $code"
EOF

echo
c_ok "Phase F done."
c_err "GO-LIVE BLOCKER — read this:"
cat <<'NOTE'
       Every page under src/app/(app)/ imports src/lib/store.ts, the JSON file
       store, which calls generate() from src/lib/seed.ts whenever db.json is
       absent. src/lib/db.ts (Postgres) is imported by NOTHING.

       Consequences:
         - The app cannot hold real data yet. First page load fabricates a full
           450-unit demo estate and persists it to PMS_DATA_DIR.
         - The runbook's "delete src/lib/seed.ts before go-live" cannot be done:
           store.ts imports it at module scope, so the build fails without it.
           Deleting .data does not help either — it just regenerates.
         - db/001_init.sql is applied above, but stays empty and unused.

       The server is correctly provisioned. The application is not ready to hold
       a real rent roll until the pages are moved from store.ts onto db.ts.
       Keep PMS_ACCESS_PASSWORD set until then.
NOTE
