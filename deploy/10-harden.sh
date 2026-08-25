#!/usr/bin/env bash
# Phase B — deploy user, SSH lockdown, firewall, fail2ban, timezone, swap.
#
# The SSH change is done in two stages with a live login test in between, so a
# bad config cannot lock you out. Stage 1 adds the new port alongside the old
# one; stage 2 removes the old port only after we have proven the new one works.
source "$(dirname "$0")/lib.sh"
require SSH_HOST DEPLOY_USER SSH_PORT_FINAL TZ

confirm "About to harden $SSH_HOST: create '$DEPLOY_USER', move SSH to port $SSH_PORT_FINAL,
disable root login and password auth, and enable ufw. Existing sessions stay up."

# ---------------------------------------------------------------------------
step "deploy user + authorised keys"
rroot <<'EOF'
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# Seed from whichever account we logged in as, so the same key keeps working.
src=$(eval echo "~${SUDO_USER:-root}")/.ssh/authorized_keys
[ -f "$src" ] || src=/root/.ssh/authorized_keys
cat "$src" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
sort -u -o "/home/$DEPLOY_USER/.ssh/authorized_keys" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

# Passwordless sudo: scripts run non-interactively over ssh and the account has
# no password to give.
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
visudo -c >/dev/null
echo "  ok   $DEPLOY_USER ready ($(wc -l < "/home/$DEPLOY_USER/.ssh/authorized_keys") key(s))"
EOF

# ---------------------------------------------------------------------------
step "firewall (both SSH ports open during the transition)"
rroot <<'EOF'
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw >/dev/null
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow 22/tcp                 comment 'ssh (temporary)'
ufw allow "$SSH_PORT_FINAL"/tcp  comment 'ssh'
ufw allow 80/tcp                 comment 'http'
ufw allow 443/tcp                comment 'https'
ufw --force enable
# 8069/8072 are deliberately absent: Odoo is reachable only through Nginx.
ufw status verbose | sed 's/^/       /'
EOF

# ---------------------------------------------------------------------------
step "sshd stage 1 — listen on $SSH_PORT_FINAL as well as 22"
rroot <<'EOF'
cat > /etc/ssh/sshd_config.d/10-pms-hardening.conf <<CONF
# Managed by deploy/10-harden.sh
Port 22
Port $SSH_PORT_FINAL
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
AllowUsers $DEPLOY_USER root $SSH_USER_INITIAL
X11Forwarding no
MaxAuthTries 3
CONF

# Ubuntu 24.04 socket-activates ssh, in which case sshd_config's Port directive
# is ignored entirely and the listener comes from ssh.socket. Cover both.
if systemctl is-enabled --quiet ssh.socket 2>/dev/null; then
  mkdir -p /etc/systemd/system/ssh.socket.d
  cat > /etc/systemd/system/ssh.socket.d/10-pms-ports.conf <<CONF
[Socket]
ListenStream=
ListenStream=22
ListenStream=$SSH_PORT_FINAL
CONF
  systemctl daemon-reload
  sshd -t
  systemctl restart ssh.socket
else
  sshd -t
  systemctl restart ssh
fi
ss -ltn | awk '/:22 |:'"$SSH_PORT_FINAL"' /{print "       listening " $4}'
EOF

step "verifying login on the new port BEFORE closing the old one"
if ssh "${SSH_OPTS[@]}" -p "$SSH_PORT_FINAL" "$DEPLOY_USER@$SSH_HOST" \
     'sudo -n true && echo verified' 2>/dev/null | grep -q verified; then
  c_ok "$DEPLOY_USER@$SSH_HOST:$SSH_PORT_FINAL works, with sudo"
else
  c_err "could not log in as $DEPLOY_USER on port $SSH_PORT_FINAL."
  c_err "Port 22 is still open and root still works — nothing is locked."
  c_err "Fix the key or config, then re-run. Not proceeding to stage 2."
  exit 1
fi

# ---------------------------------------------------------------------------
step "sshd stage 2 — drop port 22 and root login"
PHASE=post rroot <<'EOF'
sed -i '/^Port 22$/d'                       /etc/ssh/sshd_config.d/10-pms-hardening.conf
sed -i 's/^PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config.d/10-pms-hardening.conf
sed -i "s/^AllowUsers .*/AllowUsers $DEPLOY_USER/" /etc/ssh/sshd_config.d/10-pms-hardening.conf

if systemctl is-enabled --quiet ssh.socket 2>/dev/null; then
  cat > /etc/systemd/system/ssh.socket.d/10-pms-ports.conf <<CONF
[Socket]
ListenStream=
ListenStream=$SSH_PORT_FINAL
CONF
  systemctl daemon-reload
  sshd -t && systemctl restart ssh.socket
else
  sshd -t && systemctl restart ssh
fi
ufw delete allow 22/tcp || true
echo "  ok   ssh is now $DEPLOY_USER@:$SSH_PORT_FINAL, keys only"
EOF

# ---------------------------------------------------------------------------
step "fail2ban + unattended-upgrades"
PHASE=post rroot <<'EOF'
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban unattended-upgrades >/dev/null

cat > /etc/fail2ban/jail.local <<CONF
[DEFAULT]
backend = systemd

[sshd]
enabled  = true
port     = $SSH_PORT_FINAL
maxretry = 5
bantime  = 3600
findtime = 600
CONF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

systemctl enable --now fail2ban
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd | sed 's/^/       /'
EOF

# ---------------------------------------------------------------------------
step "timezone + swap"
PHASE=post rroot <<'EOF'
timedatectl set-timezone "$TZ"

if ! swapon --show | grep -q /swapfile; then
  # A fixed 4G swapfile fills an 8G root volume. Take at most half the free
  # space, and skip entirely if that leaves the box with no room to install.
  free_mb=$(df -BM --output=avail / | tail -1 | tr -dc 0-9)
  swap_mb=$(( free_mb / 2 )); [ "$swap_mb" -gt 4096 ] && swap_mb=4096
  if [ "$swap_mb" -lt 512 ]; then
    echo "warn   only ${free_mb}M free on / — skipping swapfile. Grow the volume."
  else
    fallocate -l "${swap_mb}M" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi
echo "       $(timedatectl show -p Timezone --value) | swap $(free -h | awk '/^Swap:/{print $2}')"
EOF

echo
c_ok "Phase B done. From here on connect as: ssh -i $SSH_KEY -p $SSH_PORT_FINAL $DEPLOY_USER@$SSH_HOST"
c_warn "Keep your current terminal open until you have confirmed that yourself."
