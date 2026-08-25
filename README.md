# Al Manara PMS

An internal property management system for a UAE residential landlord. It covers
the full tenancy lifecycle — leasing a unit, collecting post-dated cheques,
handling returns, renewing or ending a tenancy, and running maintenance — with
every procedure delivered as a **guided, step-by-step wizard** rather than a
blank form.

The demo portfolio is 6 buildings and 450 units.

> **Prototype.** Data lives in JSON on disk, and sign-in is a staff account
> picker rather than real authentication. Both are designed to be swapped for a
> database and company SSO before live use. See [Production readiness](#production-readiness).

---

## Table of contents

- [Why it works this way](#why-it-works-this-way)
- [Quick start](#quick-start)
- [Roles and permissions](#roles-and-permissions)
- [Features by module](#features-by-module)
- [The guided procedures](#the-guided-procedures)
- [Business rules enforced](#business-rules-enforced)
- [Approvals](#approvals)
- [Design system](#design-system)
- [Architecture](#architecture)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Production readiness](#production-readiness)

---

## Why it works this way

Property administration fails in predictable ways: a cheque is banked late, a
renewal notice misses its deadline, rent is raised above the legal cap, work is
committed to a vendor without a quote. These are process failures, not software
failures.

The system is therefore built around three ideas:

1. **Procedures are guided, not documented.** Every multi-step task is a wizard
   that presents one step at a time, states what is required, and refuses to
   advance until it is satisfied. Staff cannot skip a step by not knowing it exists.
2. **Rules are enforced in one place.** Each wizard's validation lives in a
   shared `*-rules.ts` module imported by both the browser and the server action,
   so what the employee sees on screen is exactly what the server enforces. A
   tampered client cannot bypass a rule.
3. **Everything is recorded.** Each state change writes an audit entry naming
   the actor, the action, the entity, and the before/after values.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Demo data seeds itself on first page load.

Sign in by picking any staff account — each one has a different role, so the
navigation and available actions change with the account you choose. To explore
the permission model, sign in as **Accounts** (no contract creation) and then as
**Leasing** (no cheque banking) and compare.

To wipe and reseed:

```bash
npm run reset-data
```

---

## Roles and permissions

Six roles are checked against 22 named permissions in `src/lib/rbac.ts`.
Permissions gate both the navigation and the pages themselves — a user who
reaches a forbidden URL directly is redirected to `/no-access`.

| Role | Label | Can do |
| --- | --- | --- |
| `admin` | Administrator | Everything, including user management |
| `manager` | Manager | Everything except user management; the only role that decides approvals |
| `accountant` | Accounts | Cheque banking and returns, payments, reports, audit — cannot create contracts |
| `leasing` | Leasing | Contracts, renewals, tenants, maintenance — cannot bank cheques |
| `maintenance` | Maintenance | Maintenance and tasks only |
| `viewer` | Auditor (read only) | Sees everything, changes nothing |

Two permissions are deliberately separated so that no single non-manager role
can both commit money and approve it: `cheques.deposit` (Accounts) and
`approvals.decide` (Manager only).

---

## Features by module

### Dashboard

Role-aware landing page. A red band surfaces critical alerts (money at risk)
above everything else. Below it: six KPI tiles (occupancy, annual rent roll,
collected, outstanding, at risk, expiring within 90 days), quick-launch actions
filtered to the signed-in user's permissions, cheques due within 14 days, a
12-month collection forecast built from cheques already held, the user's open
tasks, a portfolio occupancy breakdown, and recent activity.

### Properties and units

Six buildings with per-property occupancy. Units carry floor, type
(Studio/1BR/2BR/3BR/Retail/Office), size, bathrooms, parking, market rent, and
status (vacant, occupied, reserved, maintenance). Unit pages show the current
tenancy and full contract history.

### Tenants

Individuals and companies, with Emirates ID, passport, nationality, UAE mobile,
email, and trade licence for companies. Tenant pages show every contract,
cheque, and maintenance request tied to that tenant.

### Contracts

Full tenancy records: reference, unit, tenant, term, annual rent, cheque count,
security deposit, commission, Ejari registration number, document checklist, and
status (`draft`, `pending_approval`, `active`, `expiring`, `renewed`,
`terminated`, `rejected`). Created through the eight-step wizard; **no contract
becomes active without manager approval.**

### Cheques

The core of the system. Post-dated cheques are tracked individually through
`pending` → `deposited` → `cleared`, or `bounced` → `replaced`. Each cheque
records its sequence (`3 of 4`), number, bank, amount, due date, deposit slip
reference, and who handled it. Cheques approaching or past their due date are
flagged, and the system raises a task against a named employee for each one.

### Payments

Receipts across rent, deposit, commission, fees, and maintenance, by method
(cheque, cash, bank transfer, card), filterable by category.

### Renewals

Contracts inside 90 days of expiry appear here. The renewal wizard handles both
outcomes — renewing on new terms, or a non-renewal requiring served notice.

### Maintenance

Work orders with category, priority (low → emergency), SLA due date derived from
priority, assigned vendor or in-house team, quotation, and status from `new`
through `closed`. Spend at or above AED 1,000 requires manager approval before
work is committed.

### Approvals

A single queue of everything waiting on a manager, showing what is being asked,
by whom, the amount at stake, and the full context. Managers approve or reject
with a written note.

### Tasks

System-generated work assigned to named employees — cheques to bank, renewals to
start, approvals to decide. Overdue items are escalated visually.

### Reports

Portfolio and collection reporting: occupancy, rent roll, collection performance,
arrears, and expiry pipeline.

### Audit log

Immutable, filterable by actor and entity type. Every entry records who, what,
which record, when, the originating IP, and field-level before/after changes.

---

## The guided procedures

Five wizards, all built on the shared `Wizard` component in
`src/components/Wizard.tsx`:

| Procedure | Steps | Route |
| --- | --- | --- |
| New tenancy contract | 8 | `/contracts/new` |
| Renewal or non-renewal | 6 | `/renewals/[id]` |
| Maintenance intake | 5 | `/maintenance/new` |
| Bank a cheque | 4 | `/cheques/[id]/deposit` |
| Record a returned cheque | 4 | `/cheques/[id]/bounce` |

Shared behaviour across all five:

- **Steps unlock in order.** A later step is reachable only once every earlier
  step is valid.
- **Live requirement panel.** The current step always lists exactly what is
  still outstanding, and the panel turns from amber (informational) to red once
  the employee has attempted to continue.
- **Typed confirmation.** Every wizard ends by requiring the employee to type a
  specific identifier — the cheque number, the unit number, the contract
  reference — to prove the right record is being acted on.
- **Progress is explicit**, both as a bar and as a step rail showing which steps
  are complete, current, and locked.

---

## Business rules enforced

Defined in `src/lib/actions/*-rules.ts` and shared between client and server.

**New contract**
- Emirates ID must match `784-YYYY-NNNNNNN-N`.
- Mobile must be a UAE number (`+9715########`).
- Cheque numbers are 4–9 digits; duplicates at the same bank are rejected.
- Start date cannot be more than 30 days in the past.
- The unit must still be vacant at submission — a unit taken in the meantime blocks the contract.
- Cheque schedule total must reconcile to the annual rent.
- Companies must supply a trade licence number.

**Banking a cheque**
- The physical cheque must be confirmed retrieved, matched on number/bank/amount, and matched on date.
- Deposit date cannot be in the future.
- A deposit back-dated more than **14 days** is refused and escalated to a manager.
- The cheque number must be typed back exactly.

**Returned cheque**
- Bank return date, reason, and memo reference are required.
- Bank charges cannot be negative.
- The tenant must be confirmed informed, with the method recorded, before the return can be saved.
- A replacement deadline must be set.

**Renewal**
- Payment history and open maintenance must both be reviewed first.
- Rent increases are capped at **5%**; anything above requires a written justification of at least 15 characters.
- Non-renewal requires confirmation that **90-day notice** was served in writing.
- Contracts expired more than 30 days ago are escalated to a manager.

**Maintenance**
- Description must be at least 20 characters — the vendor works from this text.
- Access arrangement is mandatory; emergencies require the safety risk described.
- Estimated spend of **AED 1,000+** requires an attached written quotation.
- The unit number must be typed back to confirm.

---

## Approvals

Eight action types can never take effect on one person's authority
(`REQUIRES_APPROVAL` in `src/lib/rbac.ts`):

| Type | Rule |
| --- | --- |
| `new_contract` | New tenancies must be approved before activation |
| `renewal` | Renewals must be approved before the new term starts |
| `rent_change` | Any change to agreed rent |
| `contract_termination` | Early termination |
| `cheque_hold` | Holding a cheque past its due date |
| `cheque_replacement` | Replacing a bounced or cancelled cheque |
| `maintenance_spend` | Maintenance spend above AED 1,000 |
| `refund` | Deposit refunds |

---

## Design system

The UI is driven entirely by semantic design tokens in `src/app/globals.css`.
Runtime `--c-*` variables are defined per theme and mapped onto Tailwind utility
names with `@theme inline`, so utilities like `bg-surface`, `text-fg` and
`border-line` all re-point when the `data-theme` attribute changes on `<html>`.

**Full light and dark themes.** The theme is applied by an inline `<head>`
script during HTML parsing — before first paint — so there is no flash on load.
It respects the OS preference on first visit and remembers the user's choice
after that.

Two token ramps are deliberately kept separate, because one token cannot serve
both purposes:

- `ink-*` is fixed dark chrome (sidebar, gate screen, selected filter chips) and
  never inverts, while primary text uses `fg` / `fg-soft` / `muted` / `faint`.
- `brand-solid` backs fills that carry white text; `brand-600` is brand-coloured
  *text*. A fill dark enough to carry white text can never also be light enough
  to read as text on a dark surface.

**Accessibility.** All 42 foreground/background token pairs meet WCAG AA in both
themes. A single global `:focus-visible` rule gives keyboard users a consistent
ring without showing it to pointer users, and `prefers-reduced-motion` is honoured.

> When adding pages, use the semantic tokens only. A raw utility such as
> `bg-white` or `text-slate-500` looks correct in light mode but silently breaks
> dark mode, and neither the build nor the linter will catch it.

---

## Architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `lucide-react` icons.

```
src/
  app/
    (app)/            authenticated application, wrapped by the Shell layout
    login/            staff account picker
    gate/             site-wide password screen
    healthz/          health probe for the host
    globals.css       design tokens — the single source of colour truth
  components/
    Shell.tsx         sidebar, header, breadcrumbs, theme toggle
    Wizard.tsx        the shared guided-procedure engine
    ui.tsx            Card, Badge, Button, Stat, Table, Empty, Bar
    form.tsx          Field, Input, Select, CheckItem, RadioCards, Note
    ThemeToggle.tsx   light/dark switch and the pre-paint theme script
  lib/
    actions/          server actions and the shared *-rules.ts validation
    rbac.ts           roles, permissions, approval matrix
    store.ts          JSON persistence
    seed.ts           deterministic demo data
    queries.ts        KPIs, alerts, forecasts
    audit.ts          audit trail writer
```

**Data.** Plain JSON under `.data/` (git-ignored), regenerated deterministically
when absent. No database required to run.

**Auth.** Two independent layers. `PMS_ACCESS_PASSWORD` puts a shared password
gate in front of the whole site when hosted publicly (unset locally, so the gate
disappears). Behind it, the staff account picker sets a `pms_session` cookie.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build (honours `PORT`) |
| `npm run lint` | ESLint |
| `npm test` | Business-rule test suite |
| `npm run reset-data` | Delete demo data; regenerates on next page load |

---

## Testing

```bash
npm test
```

26 checks in `tests/rules.test.ts` covering the rule modules directly — deposit
window and cheque-number confirmation, return handling, the maintenance
description minimum and AED 1,000 quotation threshold, and the renewal 5% cap
including the boundary case of an increase of exactly 5%.

Because the tests import the same modules the wizards and server actions use, a
rule cannot pass its test while behaving differently in the application.

---

## Deployment

`render.yaml` describes a Render web service: `npm ci && npm run build`, served
by `npm start`, health-checked at `/healthz`. Render generates
`PMS_ACCESS_PASSWORD` on first deploy — read it in Dashboard → Environment and
share it with staff.

The free plan has **no persistent disk**, so anything staff change is lost when
the service sleeps (~15 minutes idle) or redeploys; the seeded demo data
regenerates identically. To keep changes, upgrade to `starter`, then uncomment
the `PMS_DATA_DIR` variable and the `disk` block in `render.yaml`.

---

## Production readiness

Three things must change before real tenancy data is handled:

1. **Authentication.** Replace the account picker with company email, password,
   and a one-time code, and restrict access to the office network or VPN.
2. **Storage.** Replace the JSON store with a real database. The `DB` interface
   in `src/lib/types.ts` is the seam to implement against.
3. **Documents.** Uploads are currently recorded as checklist entries and
   references rather than stored files; wire these to real document storage.

The permission model, rule enforcement, approval matrix, and audit trail are
designed to carry over unchanged.
