import "server-only";
import { appendAudit } from "./data";
import { User } from "./types";

/**
 * Records one audit event.
 *
 * Async because the row now goes to whichever repository is configured, and in
 * production that is Postgres. Every caller must `await` it: an audit write
 * that is fired and forgotten can be lost when the request ends, which defeats
 * the purpose of having a trail at all.
 *
 * It deliberately does not swallow errors. If the log cannot be written the
 * action fails — the absence of a record is supposed to mean something.
 */
export async function logAudit(
  actor: User,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  changes?: { field: string; from: string; to: string }[],
  /** The caller's address, when the caller knows it. */
  ip?: string
): Promise<void> {
  await appendAudit({
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    action,
    entityType,
    entityId,
    summary,
    changes,
    // Previously a hardcoded "10.0.0.24". A fabricated address in a compliance
    // trail is worse than an empty one — it looks like evidence. Empty is
    // stored as NULL, so "we did not capture it" is distinguishable.
    ip: ip ?? "",
  });
}
