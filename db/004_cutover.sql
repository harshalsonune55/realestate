-- Al Manara PMS — finish the JSON → Postgres cutover.
--
-- Forward-only. 001–003 are already applied and are not touched.
--
-- The JSON store derived a work order's reference from the length of the array
-- it was about to be pushed into (`WO-` + 1200 + count). Postgres has no such
-- handle, so the reference comes from the `counters` table like every other
-- one — but `sync_counters()` in 002 only advanced the contract, receipt and
-- approval counters. A newly generated WO- reference therefore started at 1201
-- and collided with the work orders already on file.
--
-- Idempotent: safe to re-run.

BEGIN;

INSERT INTO counters (name, value) VALUES ('maintenance', 0)
  ON CONFLICT (name) DO NOTHING;

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

  -- New in 004. Work order references carry the whole number ('WO-1264'), so
  -- the counter holds 1264 and the next reference is 1265 — the sequence the
  -- seeded data already established simply continues.
  UPDATE counters SET value = GREATEST(value, COALESCE((
    SELECT MAX(NULLIF(substring(ref FROM '(\d+)$'), '')::BIGINT) FROM maintenance_requests
  ), 0)) WHERE name = 'maintenance';
END;
$$ LANGUAGE plpgsql;

SELECT sync_counters();

-- A work order with no deadline cannot be chased, and every code path now sets
-- one. Backfill the seeded rows that predate the rule before enforcing it.
UPDATE maintenance_requests
   SET sla_due_at = reported_at + INTERVAL '3 days'
 WHERE sla_due_at IS NULL;

ALTER TABLE maintenance_requests ALTER COLUMN sla_due_at SET NOT NULL;

-- Signups are matched by address on every sign-in attempt, and the admin
-- screen lists pending requests oldest first.
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status, created_at);

-- The activity log is read newest-first per entity on every detail screen.
CREATE INDEX IF NOT EXISTS activity_entity_idx
  ON activity_log(entity_type, entity_id, at DESC);

-- Tasks are looked up by what they point at whenever an entity is advanced,
-- which is how a procedure closes its own follow-ups.
CREATE INDEX IF NOT EXISTS tasks_entity_idx ON tasks(entity_type, entity_id);

-- Approvals are resolved from the entity they govern in the same way.
CREATE INDEX IF NOT EXISTS approvals_entity_idx ON approvals(entity_type, entity_id);

COMMIT;
