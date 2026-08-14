"use server";

import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { AED, fmtDate } from "@/lib/utils";

export type SearchKind = "property" | "unit" | "tenant" | "contract" | "cheque";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  href: string;
  title: string;
  sub: string;
  /** Lower sorts first. Prefix matches beat mid-string matches. */
  rank: number;
}

/** How many hits of any one kind come back, so no single type floods the list. */
const PER_KIND = 5;
const MIN_QUERY = 2;

/**
 * Ranks a record by where the needle lands in its identifying fields. The first
 * field is the record's primary handle (unit number, cheque number, tenant
 * name), so a hit there outranks a hit on a secondary field like a bank name.
 */
function score(needle: string, fields: (string | undefined)[]): number | null {
  let best: number | null = null;
  fields.forEach((raw, i) => {
    if (!raw) return;
    const at = raw.toLowerCase().indexOf(needle);
    if (at === -1) return;
    // Field position dominates; position within the field breaks ties.
    const s = i * 100 + (at === 0 ? 0 : 10 + Math.min(at, 9));
    if (best === null || s < best) best = s;
  });
  return best;
}

/**
 * Cross-entity lookup behind the ⌘K palette.
 *
 * Runs on the server so the client never receives records the signed-in role
 * is not allowed to read — each block is gated on the same permission that
 * gates the corresponding page.
 */
export async function searchAction(query: string): Promise<SearchHit[]> {
  const user = await requireUser();
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];

  const d = db();
  const hits: SearchHit[] = [];

  const propertyName = (id: string) => d.properties.find((p) => p.id === id)?.name ?? "";

  const take = (kind: SearchKind, rows: SearchHit[]) => {
    rows.sort((a, b) => a.rank - b.rank);
    hits.push(...rows.slice(0, PER_KIND));
  };

  if (can(user.role, "properties.view")) {
    take(
      "property",
      d.properties.flatMap((p) => {
        const rank = score(needle, [p.name, p.code, p.area, p.city]);
        return rank === null
          ? []
          : [{
              kind: "property" as const,
              id: p.id,
              href: `/properties/${p.id}`,
              title: p.name,
              sub: `${p.code} · ${p.area}, ${p.city}`,
              rank,
            }];
      })
    );

    take(
      "unit",
      d.units.flatMap((u) => {
        const prop = propertyName(u.propertyId);
        const rank = score(needle, [u.unitNo, u.type, prop]);
        return rank === null
          ? []
          : [{
              kind: "unit" as const,
              id: u.id,
              href: `/units/${u.id}`,
              title: `Unit ${u.unitNo}`,
              sub: `${prop} · ${u.type} · ${u.status}`,
              rank,
            }];
      })
    );
  }

  if (can(user.role, "tenants.view")) {
    take(
      "tenant",
      d.tenants.flatMap((t) => {
        const rank = score(needle, [t.name, t.email, t.phone, t.emiratesId, t.tradeLicense]);
        return rank === null
          ? []
          : [{
              kind: "tenant" as const,
              id: t.id,
              href: `/tenants/${t.id}`,
              title: t.name,
              sub: `${t.kind === "company" ? "Company" : "Individual"} · ${t.phone}`,
              rank,
            }];
      })
    );
  }

  if (can(user.role, "contracts.view")) {
    take(
      "contract",
      d.contracts.flatMap((c) => {
        const unit = d.units.find((u) => u.id === c.unitId);
        const tenant = d.tenants.find((t) => t.id === c.tenantId);
        const rank = score(needle, [c.ref, c.ejariNo, tenant?.name, unit?.unitNo]);
        return rank === null
          ? []
          : [{
              kind: "contract" as const,
              id: c.id,
              href: `/contracts/${c.id}`,
              title: c.ref,
              sub: `${tenant?.name ?? "—"} · Unit ${unit?.unitNo ?? "—"} · ${c.status}`,
              rank,
            }];
      })
    );
  }

  if (can(user.role, "cheques.view")) {
    take(
      "cheque",
      d.cheques.flatMap((c) => {
        const rank = score(needle, [c.chequeNo, c.bank]);
        if (rank === null) return [];
        const contract = d.contracts.find((k) => k.id === c.contractId);
        const tenant = d.tenants.find((t) => t.id === contract?.tenantId);
        return [{
          kind: "cheque" as const,
          id: c.id,
          href: `/cheques/${c.id}`,
          title: `Cheque ${c.chequeNo}`,
          sub: `${tenant?.name ?? "—"} · ${AED(c.amount)} · due ${fmtDate(c.dueDate)}`,
          rank,
        }];
      })
    );
  }

  return hits.sort((a, b) => a.rank - b.rank);
}
