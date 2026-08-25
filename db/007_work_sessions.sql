BEGIN;

-- Employee time in the app.
--
-- Deliberately not the `sessions` table above: that one is auth plumbing keyed
-- by token, with an expiry and no notion of leaving. This records a *span of
-- work* — when somebody arrived, the last moment we saw them, and how the span
-- ended — which is a different question with a different lifetime.
--
-- `last_seen_at` is the important column. A person who closes the tab never
-- signs out, so login-to-logout would count them as present until the cookie
-- expired. The client refreshes `last_seen_at` while the app is actually open,
-- and a span with no refresh for longer than the idle window is treated as
-- having ended at its last heartbeat. That makes the figure honest about what
-- it can know: time with the app open and in front of someone.
CREATE TABLE IF NOT EXISTS work_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL while the span is still open.
  ended_at      TIMESTAMPTZ,
  -- 'signed_out' when they left deliberately, 'idle' when the heartbeat simply
  -- stopped. Keeping them apart matters: only the first is a real end time.
  ended_reason  TEXT CHECK (ended_reason IN ('signed_out', 'idle')),
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS work_sessions_user_idx ON work_sessions(user_id, started_at DESC);
-- The heartbeat and the sign-out both need "this person's still-open span",
-- and it is the only lookup on the hot path.
CREATE INDEX IF NOT EXISTS work_sessions_open_idx
  ON work_sessions(user_id) WHERE ended_at IS NULL;

COMMIT;
