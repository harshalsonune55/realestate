#!/usr/bin/env bash
# Shared helpers. Sourced by every deploy/NN-*.sh script; not run directly.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/server.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE — copy server.env.example, fill it in, chmod 600" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

c_ok()   { printf '\033[32m  ok\033[0m   %s\n' "$*"; }
c_warn() { printf '\033[33mwarn\033[0m   %s\n' "$*"; }
c_err()  { printf '\033[31m fail\033[0m   %s\n' "$*" >&2; }
step()   { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

require() {
  local missing=0 v
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then c_err "$v is not set in $ENV_FILE"; missing=1; fi
  done
  [[ $missing -eq 0 ]] || exit 1
}

# Expand a leading ~ so ssh -i gets a real path.
KEY_PATH="${SSH_KEY/#\~/$HOME}"

# Which port/user to use. Scripts after hardening pass PHASE=post.
ssh_port() { [[ "${PHASE:-pre}" == post ]] && echo "$SSH_PORT_FINAL" || echo "$SSH_PORT_INITIAL"; }
ssh_user() { [[ "${PHASE:-pre}" == post ]] && echo "$DEPLOY_USER"    || echo "$SSH_USER_INITIAL"; }

SSH_OPTS=(-i "$KEY_PATH" -o IdentitiesOnly=yes -o ConnectTimeout=15
          -o StrictHostKeyChecking=accept-new)

# Run a command on the server.
rsh() {
  ssh "${SSH_OPTS[@]}" -p "$(ssh_port)" "$(ssh_user)@$SSH_HOST" "$@"
}

# Run a heredoc script on the server, as root, with server.env exported.
# Usage:  rroot <<'EOF' ... EOF
rroot() {
  local sudo_prefix=""
  # No -E: the variables travel inside the script body via remote_env, and
  # sudo refuses -E under most sudoers configs anyway.
  [[ "$(ssh_user)" != root ]] && sudo_prefix="sudo"
  # Accept the script either as arguments or on stdin. Several callers pass a
  # one-liner as an argument; reading only stdin silently discarded it and ran
  # an empty script, so the step appeared to pass having done nothing.
  local body
  if [[ $# -gt 0 ]]; then body="$*"; else body="$(cat)"; fi
  # The newline matters. Command substitution strips trailing newlines, so
  # without it `set -euo pipefail` fuses onto the script's first line.
  ssh "${SSH_OPTS[@]}" -p "$(ssh_port)" "$(ssh_user)@$SSH_HOST" \
    "$sudo_prefix bash -s" <<< "$(remote_env)"$'\n'"$body"
}

# Serialise only the variables the remote side needs. Secrets travel over the
# encrypted channel and land in a root-only heredoc, never in argv or a file.
remote_env() {
  local v
  for v in ODOO_DB_NAME ODOO_DB_USER ODOO_DB_PASSWORD APP_DB_NAME APP_DB_USER \
           APP_DB_PASSWORD ODOO_VERSION ODOO_MASTER_PASSWORD ODOO_WORKERS \
           ERP_DOMAIN APP_DOMAIN CERTBOT_EMAIL APP_REPO APP_BRANCH \
           GROQ_API_KEY GROQ_MODEL PMS_ACCESS_PASSWORD DEPLOY_USER \
           SSH_USER_INITIAL SSH_PORT_FINAL RCLONE_REMOTE RCLONE_PATH BACKUP_RETAIN_DAYS \
           ALERT_EMAIL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_FROM TZ; do
    printf '%s=%q\n' "$v" "${!v:-}"
  done
  echo 'set -euo pipefail'
}

# Confirm a destructive or hard-to-reverse action unless CONFIRM=yes.
confirm() {
  [[ "${CONFIRM:-}" == yes ]] && return 0
  printf '\n\033[33m%s\033[0m\n' "$1"
  read -rp "type 'yes' to continue: " reply
  [[ "$reply" == yes ]] || { echo "aborted"; exit 1; }
}
