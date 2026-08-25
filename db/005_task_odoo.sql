-- Al Manara PMS — mirror scheduled tasks into Odoo.
--
-- Forward-only. 001–004 are already applied and are not touched.
--
-- Tasks carry the same three columns viewings already carry, for the same
-- reasons (see db/003_visits.sql):
--
--   odoo_task_id    the record this task owns in Odoo. Its presence is what
--                   makes a retry an UPDATE rather than a second create, which
--                   is the only thing standing between a flaky network and a
--                   duplicate follow-up on somebody's list.
--   odoo_synced_at  when the mirror last landed.
--   odoo_error      why the last push failed. NOT NULL means Odoo is behind;
--                   the task itself is unaffected and still authoritative.
--
-- Postgres remains the source of truth. Nothing here makes a task depend on
-- Odoo being reachable.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS odoo_task_id   BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS odoo_error     TEXT;

-- One PMS task owns at most one Odoo record, and no two tasks may claim the
-- same one. If a retry ever did create a second record, this constraint turns
-- it into a loud failure instead of a silent duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_odoo_task_id_key
  ON tasks(odoo_task_id) WHERE odoo_task_id IS NOT NULL;

-- The sweep that mirrors newly created tasks looks for exactly this set:
-- never attempted, and not yet failed. Partial so it stays small — the vast
-- majority of rows are already synced and are not in the index at all.
CREATE INDEX IF NOT EXISTS tasks_unsynced_idx
  ON tasks(created_at)
  WHERE odoo_task_id IS NULL AND odoo_error IS NULL;

-- Retry looks for the other set: attempted, failed, still unlinked.
CREATE INDEX IF NOT EXISTS tasks_sync_failed_idx
  ON tasks(created_at)
  WHERE odoo_error IS NOT NULL;

COMMIT;
