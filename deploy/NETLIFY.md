# Al Manara PMS on Netlify

The web tier only. Postgres and Odoo stay on the AWS box (16.170.201.73),
exactly as in `RENDER.md` — Netlify is a second front end onto the same
database, so the two never diverge.

    browser ──► Netlify (this site) ──┐
                                      ├──► 16.170.201.73  Postgres :5432
    mobile  ──► 16.170.201.73/pms ────┘                    Odoo     :80 → :8069

## Before you start: the one thing that does not carry over

`deploy/80-render-backend.sh` opened Postgres to a *named list of Render /32
addresses* and refuses any rule wider than /24. Netlify has no equivalent to
hand it: Functions egress from a large, shared, rotating AWS pool, and a fixed
set of outbound IPs is an Enterprise-only "Private Connectivity" add-on.

So there is no set of CIDRs you can feed that script for Netlify. Pick one:

| Option | What it costs |
| --- | --- |
| Move Postgres to a managed provider (Neon, Supabase, RDS) reachable over TLS with a password and no IP allowlist | A migration, but it removes the allowlist problem permanently and is the only option that keeps the security posture |
| Netlify Enterprise Private Connectivity | Enterprise pricing; gives you the static IPs the script wants |
| Static-IP egress proxy (QuotaGuard and similar) | Extra vendor and cost, and `pg` has no native SOCKS support so it needs a wrapper |
| Deploy with `DATABASE_URL` unset | Free and instant, but `src/lib/store.ts` serves the fabricated 450-unit demo estate, and writes fail on Netlify's read-only filesystem. A demo, not the real rent roll |
| Widen the allowlist to the public internet | Do not. The script refuses it on purpose |

Everything below works regardless of which you pick; only `DATABASE_URL`
changes.

## 1. Push the branch

Netlify builds from Git. The adapter needs no local build, which is helpful
here because `node_modules` is unusable on the iCloud-synced checkout.

    git add netlify.toml next.config.ts deploy/NETLIFY.md
    git commit -m "Deploy the web tier to Netlify"
    git push -u origin feature/assistant-and-unified-users

## 2. Create the site

Netlify → **Add new site → Import an existing project** → GitHub →
`harshalsonune55/realestate`.

- **Branch**: `feature/assistant-and-unified-users` (or `main` once merged)
- **Build command** and **publish directory**: leave them; `netlify.toml` sets
  `npm ci && npm run build` and `.next`
- Do **not** add `@netlify/plugin-nextjs`. The OpenNext adapter is applied
  automatically; installing it pins a version that will rot

## 3. Environment variables

Site configuration → Environment variables. `netlify.toml` already carries
`NODE_VERSION`, `DATABASE_SSL`, `ODOO_URL`, `ODOO_DB` and
`ASSISTANT_PROVIDER`, so only the secrets are left — the same list that is
`sync: false` in `render.yaml`:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://pms:<APP_DB_PASSWORD>@16.170.201.73:5432/almanara_pms`, or whatever the option you picked above produces |
| `ODOO_USERNAME` | `ODOO_USERNAME` from `deploy/server.env` |
| `ODOO_API_KEY` | `ODOO_API_KEY` from `deploy/server.env` |
| `GROQ_API_KEY` | `GROQ_API_KEY` from `deploy/server.env` |
| `PMS_API_TOKEN` | must equal `ApiConfig.token` in `mobile/lib/data/api_config.dart` |
| `PMS_ACCESS_PASSWORD` | the same value the AWS instance uses, so staff have one password |

Do not set `PMS_BASE_PATH` or `PMS_DATA_DIR`. `netlify.toml` explains why each
one breaks this deployment.

## 4. Verify

    curl -sS https://<site>.netlify.app/healthz                                  # ok
    curl -sS -o /dev/null -w '%{http_code}\n' https://<site>.netlify.app/        # 307 → /gate
    curl -sS -o /dev/null -w '%{http_code}\n' http://16.170.201.73/pms/healthz   # 200, unchanged

`/healthz` touches neither Postgres nor the gate, so it answers even when the
database is unreachable — if it is `ok` but the app 500s, look at
`DATABASE_URL` first.

Then sign in and confirm the dashboard shows the real portfolio. If it shows a
tidy 450-unit estate that nobody recognises, `DATABASE_URL` did not reach the
process and the JSON demo store answered instead.

## Notes

- `src/middleware.ts` becomes a Netlify Edge Function. Next 16 renamed
  Middleware to Proxy, but 16.2.12 still resolves `middleware`, so the file
  needs no rename. Netlify evaluates headers and redirects *after* middleware,
  which is the reverse of standalone Next — the gate is unaffected because it
  is the only thing in the matcher.
- `next.config.ts` drops `output: "standalone"` when `NETLIFY` is set. The AWS
  deploy still gets its standalone bundle; the adapter wants an ordinary build.
- Netlify's free tier does not sleep the way Render's does, so the ~1 minute
  cold start on the Render free plan goes away.
