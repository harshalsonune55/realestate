# Deployment — Al Manara PMS

Executable form of the Server Deployment Runbook. Each script is one phase, is
idempotent, and is safe to re-run.

## Setup

```bash
cp deploy/server.env.example deploy/server.env
chmod 600 deploy/server.env
$EDITOR deploy/server.env
```

Generate the secrets it asks for:

```bash
openssl rand -base64 32   # ODOO_DB_PASSWORD, APP_DB_PASSWORD
openssl rand -base64 48   # ODOO_MASTER_PASSWORD
```

The SSH key is the converted form of `Aber.ppk`:

```bash
puttygen ~/Downloads/Aber.ppk -O private-openssh -o ~/.ssh/aber.pem
chmod 600 ~/.ssh/aber.pem
```

## Order

| Script | Phase | Notes |
|---|---|---|
| `00-preflight.sh`  | A | Read-only. Verifies sizing, OS, DNS, ports |
| `10-harden.sh`     | B | **Changes SSH.** Keep a second terminal open |
| `20-postgres.sh`   | C | Roles, tuning, WAL archiving |
| `30-odoo.sh`       | D | ~10 min. Prints the DB-creation command at the end |
| `40-nginx.sh`      | E | Needs DNS live first |
| `50-app.sh`        | F | Next.js under pm2 |
| `60-backup.sh`     | G | Runs one backup immediately |
| `70-monitoring.sh` | H | Sends a test alert |
| `80-render-backend.sh` | I | Optional. Opens Postgres to a Render web tier — see [RENDER.md](RENDER.md) |
| `99-verify.sh`     | — | Go-live checklist, executed |

```bash
./deploy/00-preflight.sh
./deploy/10-harden.sh          # CONFIRM=yes to skip the prompt
# ...
./deploy/99-verify.sh
```

Odoo's database is created once, manually, after Phase D — `list_db = False`
hides the web installer, which is the point. `30-odoo.sh` prints the exact
command.

## Deviations from the written runbook

Each of these is a place where following the runbook literally does not work.

1. **Nginx ordering.** The runbook runs `nginx -t` on a `listen 443 ssl` vhost
   before certbot has issued a certificate; the test fails and nginx will not
   reload. `40-nginx.sh` brings up an HTTP-only vhost, obtains the cert, then
   installs the TLS config.

2. **Backup prune could delete every backup.** The original
   `find /var/backups/pms -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +`
   matches the parent directory itself. Added `-mindepth 1`.

3. **`mail` has no MTA.** Ubuntu ships without one, so every alert in Phases G
   and H would be discarded silently. `70-monitoring.sh` configures msmtp and
   test-fires it.

4. **SSH port changes are ignored under socket activation.** Ubuntu 24.04
   socket-activates ssh, so `Port 2222` in `sshd_config` does nothing on its
   own. `10-harden.sh` writes an `ssh.socket` drop-in too, and proves the new
   port works before closing port 22.

5. **Node 22, not 20.** `.node-version` pins 22.18.0.

6. **Two Postgres roles.** The app gets its own non-CREATEDB role rather than
   sharing Odoo's, so an app-side SQL flaw cannot reach ERP data.

7. **Phase F env block rewritten.** The runbook sets `ODOO_UID` and
   `SESSION_SECRET`, which nothing reads, and omits `GROQ_API_KEY`, which
   `/api/assistant` requires. What this app actually reads: `DATABASE_URL`,
   `DATABASE_SSL`, `PMS_DATA_DIR`, `PMS_ACCESS_PASSWORD`, `PMS_API_TOKEN`,
   `PMS_BASE_PATH`, `GROQ_API_KEY`, `GROQ_MODEL`, `OPENAI_API_KEY`,
   `OPENAI_MODEL`, `ASSISTANT_PROVIDER`, and — since `src/lib/odoo.ts` landed —
   `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY`.

## Which store is live

`DATABASE_URL` decides, and `src/lib/data.ts` is the seam. Set, every mutable
entity goes through a repository in `src/lib/repos` and lands in Postgres, and
`src/lib/store.ts` throws on any access rather than absorb a write into a file
nobody reads. Unset, the app runs entirely off the generated demo portfolio —
which is how a new engineer gets a populated system without provisioning one.

So on any real server, `DATABASE_URL` must be set. The symptom of forgetting is
not an error: it is a tidy 450-unit estate that nobody recognises.

This supersedes the "go-live blocker" that stood here while every page still
imported the JSON store directly. That migration has landed.
