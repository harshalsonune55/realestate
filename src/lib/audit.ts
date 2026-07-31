import "server-only";
import { write, nextId } from "./store";
import { User } from "./types";

export function logAudit(
  actor: User,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  changes?: { field: string; from: string; to: string }[]
) {
  write((d) => {
    d.audit.unshift({
      id: nextId("audit", "AU"),
      at: new Date().toISOString(),
      actorId: actor.id,
      actorName: actor.name,
      action,
      entityType,
      entityId,
      summary,
      changes,
      ip: "10.0.0.24",
    });
    if (d.audit.length > 4000) d.audit.length = 4000;
  });
}
