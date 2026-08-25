#!/usr/bin/env bash
# Phase A — verify the machine matches what the runbook assumes, before we
# change anything. Read-only: this script installs nothing.
source "$(dirname "$0")/lib.sh"
require SSH_HOST SSH_USER_INITIAL ERP_DOMAIN APP_DOMAIN

step "key"
[[ -f "$KEY_PATH" ]] || { c_err "no key at $KEY_PATH"; exit 1; }
perms=$(stat -f '%Lp' "$KEY_PATH" 2>/dev/null || stat -c '%a' "$KEY_PATH")
[[ "$perms" == 600 ]] && c_ok "key perms $perms" || c_warn "key perms $perms (want 600)"
ssh-keygen -lf "$KEY_PATH" | sed 's/^/       /'

step "reachability"
if rsh true 2>/dev/null; then
  c_ok "ssh $(ssh_user)@$SSH_HOST:$(ssh_port)"
else
  c_err "cannot ssh to $(ssh_user)@$SSH_HOST:$(ssh_port) with $KEY_PATH"
  exit 1
fi

step "operating system"
os=$(rsh '. /etc/os-release && echo "$ID $VERSION_ID"')
[[ "$os" == "ubuntu 24.04" ]] && c_ok "$os" \
  || c_warn "$os — runbook is written for ubuntu 24.04; package names may differ"

step "sizing (Phase A.1 wants 4 vCPU / 8 GB / 100 GB)"
read -r cpu mem disk <<<"$(rsh 'echo $(nproc) $(free -g | awk "/^Mem:/{print \$2}") $(df -BG --output=size / | tail -1 | tr -dc 0-9)')"
[[ "$cpu"  -ge 4  ]] && c_ok "vCPU $cpu"     || c_warn "vCPU $cpu (want 4) — 5 Odoo workers will contend"
[[ "$mem"  -ge 7  ]] && c_ok "RAM ${mem}G"   || c_warn "RAM ${mem}G (want 8) — lower ODOO_WORKERS or add swap"
[[ "$disk" -ge 90 ]] && c_ok "disk ${disk}G" || c_warn "disk ${disk}G (want 100) — filestore grows ~5G/year"

step "ports already in use"
rsh 'ss -ltnp 2>/dev/null | awk "NR>1{print \$4}" | grep -E ":(80|443|5432|8069|8072|3000)$" || true' \
  | sed 's/^/       in use: /' || true

step "existing install (is this box already provisioned?)"
for unit in postgresql odoo nginx; do
  if rsh "systemctl list-unit-files --no-legend '$unit*' 2>/dev/null | grep -q ." ; then
    c_warn "$unit already present — scripts are idempotent but review before re-running"
  else
    c_ok "$unit not installed"
  fi
done

step "dns (certbot needs these pointing here before 40-nginx.sh)"
server_ip=$(rsh "curl -fsS --max-time 10 https://api.ipify.org || hostname -I | awk '{print \$1}'")
echo "       server public ip: $server_ip"
for d in "$ERP_DOMAIN" "$APP_DOMAIN"; do
  got=$(dig +short A "$d" | tail -1)
  if [[ -z "$got" ]];         then c_err  "$d does not resolve"
  elif [[ "$got" == "$server_ip" ]]; then c_ok "$d -> $got"
  else                             c_warn "$d -> $got (server is $server_ip)"
  fi
done

step "data residency (Phase A.3)"
c_warn "confirm with the company that $server_ip is in an approved jurisdiction."
echo "       This system stores Emirates ID and passport data — personal data under"
echo "       UAE Federal Decree-Law No. 45 of 2021. Moving it later is painful."

echo
c_ok "preflight complete — resolve any 'fail' lines before running 10-harden.sh"
