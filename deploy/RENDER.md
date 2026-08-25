# Render front end, AWS back end

The web tier moves to Render. Nothing else does.

```
                    ┌──────────────────────────── 16.170.201.73 ───────────┐
  browser ──────►  Render                                                  │
                    │  al-manara-pms       nginx :80 ──┬─► Odoo   :8069    │
                    │  (frankfurt)                     │   (loopback)      │
                    │        │                         └─► /pms → :3000    │
                    │        │                             the app, still  │
  mobile ───────────┼────────┼───────────────────────────► serving mobile  │
                    │        │                                             │
                    │        └────── :5432 TLS ─────────► Postgres         │
                    └──────────────────────────────────────────────────────┘
```

Both front ends read and write the same Postgres, so there is one rent roll and
no reconciliation to do. Odoo and the app remain on the one address they have
always shared; the mobile client's `ApiConfig.baseUrl` keeps working untouched.

## What is actually new

One thing: Postgres, which has only ever listened on 127.0.0.1, now also
accepts TLS connections from the Render web tier's outbound addresses. That is
the entire server-side change, and `deploy/80-render-backend.sh` is all of it.

## Order

Do not skip step 0. The box has already lost Postgres to a full root
filesystem more than once, and a second front end on a database that cannot
write is a worse outage, not a better one.

### 0. Free the disk

`df -h /` should not read 100%. When it does, Postgres drops into recovery mode
and every page on both front ends fails. Reclaim from caches only — each of
these regenerates, and none of them is data:

```bash
sudo apt-get clean                  # ~63 MB of downloaded .debs
sudo rm -rf /var/lib/apt/lists/*    # ~147 MB; `sudo apt-get update` rebuilds it
sudo rm -rf /opt/odoo/.cache/pip    # ~74 MB of pip wheels
sudo journalctl --vacuum-size=20M   # ~12 MB
sudo systemctl restart postgresql
sudo -u postgres psql -c 'select 1' # must answer before going further
```

Leave `/var/backups` alone. The 126 MB of dumps and 97 MB of WAL under it are
the only copy of this data that is not on this disk, and `60-backup.sh` already
expires them on `BACKUP_RETAIN_DAYS`.

6.7 GB total, with Odoo's source tree taking 1.6 GB of it, is the real problem
and cleaning caches only postpones it. Growing the EBS volume is the fix;
moving the app to Render buys some room in the meantime.

### 1. Create the Render service

Render dashboard → New → Blueprint → point it at this repository. It reads
`render.yaml`: Frankfurt, free plan, `/healthz` as the health check.

Frankfurt because Postgres is in `eu-north-1` and every server-rendered page
makes several round trips to it. Singapore, which the old `render.yaml` named,
is roughly ten times further away in latency terms. Render pins a service to
its region permanently, so this is chosen once.

The first deploy fails at the database, which is expected — the security group
has not been opened yet.

### 2. Read the outbound addresses

The service → **Connect ▾** → **Outbound**. Usually three addresses, shared by
every service in the region. Put them in `deploy/server.env`:

```bash
RENDER_OUTBOUND_IPS="203.0.113.10 203.0.113.11 203.0.113.12"
```

### 3. Open Postgres to exactly those addresses

```bash
./deploy/80-render-backend.sh
```

It writes one `hostssl` rule per address, for `almanara_pms` and the `pms` role
only, inside a marked block that a re-run replaces rather than duplicates. It
refuses anything wider than a /24, checks disk headroom before touching
anything, and requires TLS — `hostssl`, so a downgraded connection is refused
rather than accepted in the clear.

It cannot edit the security group; there are no AWS credentials on the deploy
side. It prints the rules to add, one `/32` per address, and until they exist
AWS drops the packets and the change has no effect. That ordering is
deliberate: the script is safe to run before the firewall is opened.

`listen_addresses` needs a restart, not a reload. The script says so if the
socket is still loopback-only afterwards.

### 4. Fill in the Render environment

Every `sync: false` key in `render.yaml`, from `deploy/server.env`:

| Render key            | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`        | `postgresql://pms:<APP_DB_PASSWORD>@16.170.201.73:5432/almanara_pms` |
| `ODOO_USERNAME`       | `ODOO_USERNAME`                                              |
| `ODOO_API_KEY`        | `ODOO_API_KEY`                                               |
| `GROQ_API_KEY`        | `GROQ_API_KEY`                                               |
| `PMS_API_TOKEN`       | must equal `ApiConfig.token` in the mobile app               |
| `PMS_ACCESS_PASSWORD` | the same value the AWS instance uses, so staff have one password |

`DATABASE_SSL`, `ODOO_URL`, `ODOO_DB` and `ASSISTANT_PROVIDER` are already in
`render.yaml` and need nothing.

Do not set `PMS_BASE_PATH` or `PMS_DATA_DIR`. `render.yaml` explains why each
one breaks this deployment.

### 5. Verify

```bash
curl -sS https://<service>.onrender.com/healthz        # ok
curl -sS -o /dev/null -w '%{http_code}\n' https://<service>.onrender.com/   # 307 → /gate
curl -sS -o /dev/null -w '%{http_code}\n' http://16.170.201.73/pms/healthz  # 200, unchanged
curl -sS -o /dev/null -w '%{http_code}\n' http://16.170.201.73/             # 303 → Odoo
```

Then log in on Render and confirm the dashboard shows the real portfolio. If it
shows a tidy 450-unit estate that nobody recognises, `DATABASE_URL` did not
reach the process and the JSON demo store answered instead.

From the box, watch the connection actually arrive:

```bash
sudo -u postgres psql -c \
  "select client_addr, ssl from pg_stat_ssl join pg_stat_activity using (pid)
   where datname = 'almanara_pms'"
```

A Render address with `ssl = t` is the whole system working.

## Known sharp edges

**Odoo over TLS.** `ODOO_URL` is `http://16.170.201.73`, so `ODOO_API_KEY`
crosses the public internet in clear text — it was loopback traffic when the
app ran on the same box. Fixing it means opening :443 in the security group,
pointing `app.almanara.ae` and `erp.almanara.ae` at 16.170.201.73 (today they
resolve to 159.69.115.63, which is somewhere else entirely), running
`40-nginx.sh` for the certificate, and setting `ODOO_URL` to
`https://erp.almanara.ae`. Worth doing before this carries real tenant data.

**Free instances sleep.** ~15 minutes idle, then roughly a minute to answer the
request that wakes them. Change `plan: free` to `plan: starter` in
`render.yaml`; nothing else moves.

**Latency is per query, not per page.** Frankfurt to Stockholm is ~25 ms and
every one of a page's queries pays it. A page that felt instant over a loopback
socket will not feel instant here. If a screen turns sluggish, the fix is fewer
round trips in `src/lib/repos`, not a bigger instance.

**Two front ends, one database.** The AWS instance at `/pms` still runs, on the
same Postgres, because the mobile app points at it. Deploying a schema change
means both need the new code — Render redeploys on push, the AWS box does not.
