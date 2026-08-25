#!/usr/bin/env bash
# Phase I — let the Render web tier reach this box's Postgres.
#
# Everything else stays exactly where it is. Odoo keeps :8069 on loopback and
# is reached through nginx on the shared IP; the app keeps running at /pms for
# the mobile client; the database keeps living here. The only thing that
# changes is that Postgres, which has listened on 127.0.0.1 alone, also accepts
# TLS connections from a named handful of Render addresses.
#
# Three deliberate narrowings, because the alternative is a database on the
# public internet:
#
#   1. hostssl, never host. A plaintext row of pg_hba would let a downgraded
#      connection through, and the credential crosses the open internet now.
#   2. One rule per Render IP as /32, for one database and one role. Not
#      `all all`, and the script refuses a rule wider than /24.
#   3. The security group still has to allow :5432 separately. That is not
#      done here — no AWS credentials on this side — and the step prints the
#      exact rule to add. Until it is added, this change has no effect at all,
#      which makes it a safe thing to run first.
source "$(dirname "$0")/lib.sh"
require APP_DB_NAME APP_DB_USER RENDER_OUTBOUND_IPS
PHASE=post

# ---------------------------------------------------------------- validate --
# A typo here is a database exposed to a /8. Check before anything is written.
for cidr in $RENDER_OUTBOUND_IPS; do
  [[ "$cidr" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$ ]] || {
    c_err "RENDER_OUTBOUND_IPS: '$cidr' is not an IPv4 address or CIDR"; exit 1; }
  # A bare address is a single host. `set -e` is on, so this cannot be written
  # as `[[ ... ]] && prefix=32` — the false branch would abort the script.
  if [[ "$cidr" == */* ]]; then prefix="${cidr#*/}"; else prefix=32; fi
  (( prefix >= 24 )) || { c_err "refusing /$prefix — $cidr is wider than /24"; exit 1; }
done
c_ok "$(wc -w <<< "$RENDER_OUTBOUND_IPS" | tr -d ' ') Render address(es) look sane"

step "disk headroom first"
# Postgres on this box has already been knocked into recovery mode by a full
# root filesystem. Opening it to a second front end without checking that would
# be putting more load on a database that cannot write.
rroot <<'EOF'
avail=$(df -Pk / | awk 'NR==2{print $4}')
printf '       root fs: %s used, %s available\n' \
  "$(df -Ph / | awk 'NR==2{print $5}')" "$(df -Ph / | awk 'NR==2{print $4}')"
if (( avail < 512000 )); then
  echo " fail   under 500 MB free. Postgres cannot survive this; fix the disk first." >&2
  exit 1
fi
if ! sudo -u postgres psql -qtAX -c 'select 1' >/dev/null 2>&1; then
  echo " fail   Postgres is not accepting connections. Fix that before opening it up." >&2
  exit 1
fi
echo "  ok   postgres is answering"
EOF

confirm "About to let Postgres accept connections from outside this box:
  $RENDER_OUTBOUND_IPS
  database: $APP_DB_NAME   role: $APP_DB_USER   TLS: required"

step "postgresql.conf — listen beyond loopback"
rroot <<'EOF'
CONF=$(ls -d /etc/postgresql/*/main/postgresql.conf | tail -1)
if grep -qE "^listen_addresses" "$CONF"; then
  sed -i "s|^listen_addresses.*|listen_addresses = '*'\t\t# managed by deploy/80-render-backend.sh|" "$CONF"
else
  printf "\nlisten_addresses = '*'\t\t# managed by deploy/80-render-backend.sh\n" >> "$CONF"
fi
grep -E "^listen_addresses" "$CONF" | sed 's/^/       /'

# ssl was already on with Debian's snakeoil certificate, which is what the app
# connects to with rejectUnauthorized:false. Assert rather than assume: without
# it every hostssl rule below silently rejects.
grep -qE "^ssl\s*=\s*on" "$CONF" || { echo " fail   ssl is not on in $CONF" >&2; exit 1; }
echo "  ok   ssl = on"
EOF

step "pg_hba.conf — one TLS rule per Render address"
# Written as a managed block so a re-run replaces the previous set rather than
# stacking duplicates, and so removing an IP from server.env actually removes
# its access.
rroot <<EOF
HBA=\$(ls -d /etc/postgresql/*/main/pg_hba.conf | tail -1)
cp -a "\$HBA" "\$HBA.bak.\$(date +%Y%m%d-%H%M%S)"

# Drop the old block, if any.
sed -i '/^# >>> render (deploy\/80-render-backend.sh)/,/^# <<< render/d' "\$HBA"

{
  echo "# >>> render (deploy/80-render-backend.sh) — do not edit between markers"
  for cidr in $RENDER_OUTBOUND_IPS; do
    case "\$cidr" in */*) ;; *) cidr="\$cidr/32" ;; esac
    printf 'hostssl %-14s %-10s %-18s scram-sha-256\n' "$APP_DB_NAME" "$APP_DB_USER" "\$cidr"
  done
  echo "# <<< render"
} >> "\$HBA"

sed -n '/^# >>> render/,/^# <<< render/p' "\$HBA" | sed 's/^/       /'
EOF

step "reload"
rroot <<'EOF'
# reload, not restart: no open Odoo session is dropped. listen_addresses needs
# a restart to take effect, so check whether it already did and say so plainly
# instead of leaving a half-applied change looking finished.
systemctl reload postgresql
sleep 1
if ss -ltn | grep -qE '0\.0\.0\.0:5432|\*:5432'; then
  echo "  ok   listening on all interfaces"
else
  echo "warn   still loopback-only — listen_addresses needs a restart:"
  echo "         sudo systemctl restart postgresql"
  echo "       Odoo reconnects on its own; a request in flight may error once."
fi
ss -ltn | grep 5432 | sed 's/^/       /'
EOF

step "security group — the part this script cannot do"
cat <<NOTE
       Postgres is now willing to accept those addresses, but AWS still drops
       the packets: the security group on this instance allows :22 and :80 only.
       Add one inbound rule per Render address, then re-run 99-verify.sh.

       Console → EC2 → Instances → 16.170.201.73 → Security → the security
       group → Edit inbound rules → Add rule:

           Type    PostgreSQL
           Port    5432
           Source  <one Render IP>/32     (one rule each, never 0.0.0.0/0)

       Or, with the AWS CLI configured locally:

NOTE
for cidr in $RENDER_OUTBOUND_IPS; do
  case "$cidr" in */*) ;; *) cidr="$cidr/32" ;; esac
  echo "           aws ec2 authorize-security-group-ingress --group-id <sg-id> \\"
  echo "             --protocol tcp --port 5432 --cidr $cidr"
done

echo
c_ok "Phase I done on the server side."
c_warn "Not reachable from Render until the security group rule above exists."
