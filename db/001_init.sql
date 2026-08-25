-- Al Manara PMS — initial schema.
--
-- This replaces the JSON file store and becomes the single source of truth for
-- both the Next.js web app and the Flutter mobile client.
--
-- Money is stored in fils (1 AED = 100 fils) as BIGINT. Storing currency as a
-- float would accumulate rounding errors across a 450-unit rent roll, and this
-- system reconciles cheque schedules against annual rent to the dirham.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Case-insensitive email: nobody should be locked out for typing Yousef@… when
-- they registered as yousef@…, and two such rows must never both exist.
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- accounts --

CREATE TYPE user_role AS ENUM (
  'admin', 'manager', 'accountant', 'leasing', 'maintenance', 'viewer'
);

-- Signups land as 'pending' and cannot sign in until an administrator approves
-- them; otherwise anyone reaching the URL could enrol themselves into the
-- company's live tenancy data.
CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         CITEXT      NOT NULL UNIQUE,
  phone         TEXT,
  title         TEXT        NOT NULL DEFAULT '',
  role          user_role   NOT NULL DEFAULT 'viewer',
  status        user_status NOT NULL DEFAULT 'pending',
  password_hash TEXT        NOT NULL,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Opaque bearer tokens. The web stores one in an httpOnly cookie, the Flutter
-- client in secure storage; both hit the same verification path.
CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  user_agent  TEXT,
  platform    TEXT
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

-- ---------------------------------------------------------------- property --

CREATE TABLE properties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  address    TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT 'Abu Dhabi',
  area       TEXT NOT NULL DEFAULT '',
  owner      TEXT NOT NULL DEFAULT '',
  floors     INT  NOT NULL DEFAULT 1,
  year_built INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE unit_status AS ENUM ('vacant', 'occupied', 'reserved', 'maintenance');

CREATE TABLE units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_no       TEXT NOT NULL,
  floor         INT  NOT NULL DEFAULT 1,
  type          TEXT NOT NULL DEFAULT 'Studio',
  size_sqft     INT  NOT NULL DEFAULT 0,
  bathrooms     INT  NOT NULL DEFAULT 1,
  parking_slots INT  NOT NULL DEFAULT 0,
  market_rent   BIGINT NOT NULL DEFAULT 0,
  status        unit_status NOT NULL DEFAULT 'vacant',
  UNIQUE (property_id, unit_no)
);
CREATE INDEX units_property_idx ON units(property_id);
CREATE INDEX units_status_idx ON units(status);

-- ----------------------------------------------------------------- tenants --

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'individual',
  emirates_id   TEXT,
  passport_no   TEXT,
  nationality   TEXT,
  phone         TEXT,
  email         TEXT,
  trade_license TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------- contracts --

CREATE TYPE contract_status AS ENUM (
  'draft', 'pending_approval', 'active', 'expiring', 'renewed', 'terminated', 'rejected'
);

CREATE TABLE contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref              TEXT NOT NULL UNIQUE,
  unit_id          UUID NOT NULL REFERENCES units(id),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  annual_rent      BIGINT NOT NULL,
  cheque_count     INT NOT NULL DEFAULT 1,
  security_deposit BIGINT NOT NULL DEFAULT 0,
  commission       BIGINT NOT NULL DEFAULT 0,
  ejari_no         TEXT,
  status           contract_status NOT NULL DEFAULT 'draft',
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  notes            TEXT
);
CREATE INDEX contracts_unit_idx ON contracts(unit_id);
CREATE INDEX contracts_tenant_idx ON contracts(tenant_id);
CREATE INDEX contracts_status_idx ON contracts(status);
CREATE INDEX contracts_end_idx ON contracts(end_date);

-- ----------------------------------------------------------------- cheques --

CREATE TYPE cheque_status AS ENUM (
  'pending', 'deposited', 'cleared', 'bounced', 'replaced', 'cancelled'
);

CREATE TABLE cheques (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  seq             INT NOT NULL,
  of_total        INT NOT NULL,
  cheque_no       TEXT NOT NULL,
  bank            TEXT NOT NULL,
  amount          BIGINT NOT NULL,
  due_date        DATE NOT NULL,
  status          cheque_status NOT NULL DEFAULT 'pending',
  deposited_at    TIMESTAMPTZ,
  deposited_by    UUID REFERENCES users(id),
  deposit_slip_no TEXT,
  cleared_at      TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  bounce_reason   TEXT,
  held_reason     TEXT,
  -- The same cheque number can legitimately recur across different banks, but
  -- never twice at one bank; the wizard enforces this and so does the schema.
  UNIQUE (bank, cheque_no)
);
CREATE INDEX cheques_contract_idx ON cheques(contract_id);
CREATE INDEX cheques_due_idx ON cheques(due_date);
CREATE INDEX cheques_status_idx ON cheques(status);

-- ---------------------------------------------------------------- payments --
-- Money in. Joined to a unit through the contract for per-unit income.

CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no  TEXT NOT NULL UNIQUE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  unit_id     UUID REFERENCES units(id),
  cheque_id   UUID REFERENCES cheques(id) ON DELETE SET NULL,
  amount      BIGINT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'cheque',
  category    TEXT NOT NULL DEFAULT 'rent',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES users(id),
  reference   TEXT
);
CREATE INDEX payments_unit_idx ON payments(unit_id);
CREATE INDEX payments_received_idx ON payments(received_at);

-- ---------------------------------------------------------------- expenses --
-- Money out. New: the JSON store had no concept of expenses at all, so net
-- profit per unit was impossible to calculate.

CREATE TABLE expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref         TEXT NOT NULL UNIQUE,
  unit_id     UUID REFERENCES units(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  category    TEXT NOT NULL DEFAULT 'maintenance',
  description TEXT NOT NULL DEFAULT '',
  amount      BIGINT NOT NULL,
  vendor      TEXT,
  incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_unit_idx ON expenses(unit_id);
CREATE INDEX expenses_property_idx ON expenses(property_id);
CREATE INDEX expenses_date_idx ON expenses(incurred_on);

-- --------------------------------------------------------------- check-ins --
-- An employee checking in at a unit. The administrator is notified on insert.

CREATE TABLE check_ins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id       UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  purpose       TEXT NOT NULL DEFAULT 'inspection',
  note          TEXT,
  checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at TIMESTAMPTZ,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  platform      TEXT
);
CREATE INDEX check_ins_user_idx ON check_ins(user_id);
CREATE INDEX check_ins_unit_idx ON check_ins(unit_id);
CREATE INDEX check_ins_time_idx ON check_ins(checked_in_at DESC);

-- ----------------------------------------------------------- notifications --
-- In-app only. No push provider is involved: clients poll or refresh.

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  entity_type  TEXT,
  entity_id    UUID,
  href         TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications(recipient_id) WHERE read_at IS NULL;

-- ------------------------------------------------------------ activity log --
-- Every action, permanently recorded. Doubles as the per-employee daily log
-- the administrator reviews.

CREATE TABLE activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  summary     TEXT NOT NULL,
  changes     JSONB,
  ip          TEXT,
  platform    TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_actor_idx ON activity_log(actor_id, at DESC);
CREATE INDEX activity_at_idx ON activity_log(at DESC);

-- ------------------------------------------------------- tasks & approvals --

CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'done', 'overdue');

CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date     DATE NOT NULL,
  status       task_status NOT NULL DEFAULT 'open',
  priority     TEXT NOT NULL DEFAULT 'medium',
  entity_type  TEXT,
  entity_id    UUID,
  source       TEXT NOT NULL DEFAULT 'system',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX tasks_assignee_idx ON tasks(assigned_to, status);

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  entity_type   TEXT,
  entity_id     UUID,
  amount        BIGINT,
  requested_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  status        approval_status NOT NULL DEFAULT 'pending',
  decision_note TEXT
);
CREATE INDEX approvals_status_idx ON approvals(status);

-- ------------------------------------------------------------- maintenance --

CREATE TABLE maintenance_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref              TEXT NOT NULL UNIQUE,
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id        UUID REFERENCES tenants(id) ON DELETE SET NULL,
  category         TEXT NOT NULL DEFAULT 'general',
  priority         TEXT NOT NULL DEFAULT 'medium',
  description      TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'new',
  reported_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to      UUID REFERENCES users(id) ON DELETE SET NULL,
  vendor           TEXT,
  quote_amount     BIGINT,
  sla_due_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  resolution_notes TEXT
);
CREATE INDEX maintenance_unit_idx ON maintenance_requests(unit_id);
CREATE INDEX maintenance_status_idx ON maintenance_requests(status);

COMMIT;
