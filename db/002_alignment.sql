-- Al Manara PMS — align the schema with the domain model in src/lib/types.ts.
--
-- 001_init.sql was written ahead of the migration and is missing a handful of
-- fields the application already relies on. Every one of these is currently
-- held in the JSON store, so without them the move to Postgres would silently
-- drop data: a terminated contract would lose its reason, a renewal would lose
-- its link back to the contract it replaced, and a bounced cheque would lose
-- the pointer to its replacement.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ------------------------------------------------------------- properties --
-- Property.managerId — who is accountable for the building.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- -------------------------------------------------------------- contracts --
-- Contract.documents: the Ejari / passport / cheque-copy checklist. JSONB
-- rather than a table because it is a fixed checklist rendered as a whole and
-- never queried field-by-field.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Contract.renewedFromId — the chain a renewal came from. Without it the
-- renewals screen cannot show tenancy history.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS renewed_from_id UUID REFERENCES contracts(id) ON DELETE SET NULL;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS termination_reason TEXT;

CREATE INDEX IF NOT EXISTS contracts_renewed_from_idx
  ON contracts(renewed_from_id) WHERE renewed_from_id IS NOT NULL;

-- ---------------------------------------------------------------- cheques --
-- Cheque.replacedByChequeId — a bounced cheque points at the one that replaced
-- it. This is the audit trail an accountant follows when reconciling.
ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS replaced_by_cheque_id UUID REFERENCES cheques(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------ users --
-- The approval workflow records declines as well as approvals; 001 only had
-- the approving half, so a declined signup lost its reason and reviewer.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS requested_role  user_role,
  ADD COLUMN IF NOT EXISTS declined_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS declined_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decline_reason  TEXT;

-- 001 declared password_hash NOT NULL, but the seeded demo accounts sign in by
-- one-click selection and have no password. Relax it rather than storing a
-- hash nobody can use.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- --------------------------------------------------------------- counters --
-- Human-facing reference numbers (CN-0042, RCP-1180, APR-0007). The JSON store
-- kept these in a `counters` map; in Postgres they need to be atomic, because
-- two users creating a contract at the same moment must not both get CN-0042.
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

-- Returns the next value atomically. UPDATE ... RETURNING takes a row lock, so
-- concurrent callers serialise on it rather than racing.
CREATE OR REPLACE FUNCTION next_counter(counter_name TEXT)
RETURNS BIGINT AS $$
DECLARE
  n BIGINT;
BEGIN
  INSERT INTO counters (name, value) VALUES (counter_name, 0)
    ON CONFLICT (name) DO NOTHING;
  UPDATE counters SET value = value + 1 WHERE name = counter_name RETURNING value INTO n;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

INSERT INTO counters (name, value) VALUES
  ('contract', 0), ('receipt', 0), ('approval', 0), ('expense', 0), ('maintenance', 0)
ON CONFLICT (name) DO NOTHING;

-- Advances each counter past the highest reference already on file, so a newly
-- generated ref cannot collide with imported data.
--
-- This must be callable rather than a one-off UPDATE: migrations run against an
-- empty database, so a backfill executed here would see nothing. db/seed.ts
-- calls it after loading, and it is safe to call again at any time.
CREATE OR REPLACE FUNCTION sync_counters() RETURNS void AS $$
BEGIN
  -- Only the trailing digit group counts: 'CTR-2026-0399' is contract 399, not
  -- 20260399, so stripping every non-digit would overshoot wildly.
  UPDATE counters SET value = GREATEST(value, COALESCE((
    SELECT MAX(NULLIF(substring(ref FROM '(\d+)$'), '')::BIGINT) FROM contracts
  ), 0)) WHERE name = 'contract';

  UPDATE counters SET value = GREATEST(value, COALESCE((
    SELECT MAX(NULLIF(substring(receipt_no FROM '(\d+)$'), '')::BIGINT) FROM payments
  ), 0)) WHERE name = 'receipt';

  UPDATE counters SET value = GREATEST(value, COALESCE((
    SELECT MAX(NULLIF(substring(ref FROM '(\d+)$'), '')::BIGINT) FROM approvals
  ), 0)) WHERE name = 'approval';
END;
$$ LANGUAGE plpgsql;

SELECT sync_counters();

COMMIT;
