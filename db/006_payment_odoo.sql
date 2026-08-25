-- Al Manara PMS — mirror cheque and payment detail into Odoo.
--
-- Forward-only. 001–005 are already applied and are not touched.
--
-- Cheques and payments each carry the same three mirror columns viewings and
-- tasks already carry (see db/003_visits.sql, db/005_task_odoo.sql):
--
--   odoo_payment_id  the `account.payment` this row owns in Odoo. Its presence
--                    is what makes a retry an UPDATE rather than a second
--                    create — the guard against duplicated money in the ERP.
--   odoo_synced_at   when the mirror last landed.
--   odoo_error       why the last push failed. NOT NULL means Odoo is behind;
--                    the cheque/payment itself is unaffected and authoritative.
--
-- The Odoo records are created as DRAFT account.payments and are never posted
-- by the PMS. Posting to the ledger stays a deliberate accountant action.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS odoo_payment_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS odoo_error      TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS odoo_payment_id BIGINT,
  ADD COLUMN IF NOT EXISTS odoo_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS odoo_error      TEXT;

-- One PMS row owns at most one Odoo payment, and no two rows may claim the same
-- one. A retry that ever created a second record turns into a loud failure
-- rather than a silent duplicate in the ledger.
CREATE UNIQUE INDEX IF NOT EXISTS cheques_odoo_payment_id_key
  ON cheques(odoo_payment_id) WHERE odoo_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_odoo_payment_id_key
  ON payments(odoo_payment_id) WHERE odoo_payment_id IS NOT NULL;

-- The sweep that mirrors newly created rows looks for exactly this set: never
-- attempted, and not yet failed. Partial so it stays small.
CREATE INDEX IF NOT EXISTS cheques_unsynced_idx
  ON cheques(due_date) WHERE odoo_payment_id IS NULL AND odoo_error IS NULL;
CREATE INDEX IF NOT EXISTS payments_unsynced_idx
  ON payments(received_at) WHERE odoo_payment_id IS NULL AND odoo_error IS NULL;

COMMIT;
