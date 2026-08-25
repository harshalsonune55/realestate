-- Al Manara PMS — property viewings, and their mirror in the Odoo calendar.
--
-- The app still reads from the JSON store, so this table is not yet the live
-- source of the viewings screen. It exists now, alongside the store, so the
-- Postgres cutover in `src/lib/repo.ts` does not have to invent a shape later —
-- and so nothing is lost when it happens.
--
-- The Odoo columns are deliberately part of the row rather than a side table:
-- "is this booking in the calendar" is a property of the booking, and a viewing
-- whose calendar entry never landed needs to be findable in one query.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref             TEXT NOT NULL UNIQUE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  -- Set only when the visitor is already a tenant on file. Most viewings are
  -- with people who are not, which is the point of keeping the name and phone
  -- on the row rather than requiring a tenant record up front.
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  visitor_name    TEXT NOT NULL,
  visitor_phone   TEXT NOT NULL,
  visitor_email   TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER NOT NULL DEFAULT 30,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  outcome         TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  booked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- `calendar.event` id in Odoo. Null means the mirror has not landed.
  odoo_event_id   BIGINT,
  odoo_synced_at  TIMESTAMPTZ,
  odoo_error      TEXT,

  CONSTRAINT visits_duration_sane CHECK (duration_mins BETWEEN 5 AND 480),
  CONSTRAINT visits_status_known CHECK (
    status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')
  ),
  CONSTRAINT visits_outcome_known CHECK (
    outcome IN ('', 'interested', 'not_interested', 'offer_made')
  )
);

-- The diary query: what is coming up, soonest first.
CREATE INDEX IF NOT EXISTS visits_starts_at_idx ON visits (starts_at);
-- The clash check when booking a slot for one unit.
CREATE INDEX IF NOT EXISTS visits_unit_starts_idx ON visits (unit_id, starts_at);
-- Partial: the only rows anyone needs to chase are live bookings that never
-- reached the calendar, and that set stays small even as the table grows.
CREATE INDEX IF NOT EXISTS visits_unsynced_idx
  ON visits (starts_at)
  WHERE odoo_event_id IS NULL AND status <> 'cancelled';

COMMIT;
