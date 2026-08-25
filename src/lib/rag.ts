import "server-only";
import { can } from "./rbac";
import { AED, fmtDate } from "./utils";
import type { DB, User } from "./types";

/**
 * Retrieval over the operational records, feeding the assistant.
 *
 * WHY LEXICAL AND NOT VECTOR
 * Almost every real question here carries an identifier — a cheque number, a
 * unit number, an Ejari reference, a person's name. Embeddings are weakest
 * exactly there: "350958" and "350957" land in near-identical vector space,
 * so a semantic index happily returns the wrong cheque. BM25 keys off the
 * literal token and gets it right. It also needs no embedding provider (Groq
 * serves no embedding model), no index to rebuild when a cheque clears, and
 * no vector store to operate.
 *
 * The summary briefing in `assistant.ts` still goes out with every request and
 * carries the aggregates. This adds the specific records that briefing cannot
 * hold — 450 units and ~1,700 cheques will not fit a prompt, but the eight
 * that match the question will.
 */

export interface Doc {
  id: string;
  kind: string;
  /** Text that gets both indexed and, if retrieved, shown to the model. */
  text: string;
}

export interface Retrieved extends Doc {
  score: number;
}

/* --------------------------------------------------------------- tokenising */

/** Words and bare numbers, lowercased. Identifiers survive as whole tokens. */
function tokenise(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/* ------------------------------------------------------------------ corpus */

/**
 * Assembles the searchable corpus for one user.
 *
 * Each block is gated on the same permission as its page, so retrieval can
 * never surface a record the person could not open directly. Tenant documents
 * carry the contact details on purpose — unlike the always-on briefing, these
 * only reach the model when the question already named that tenant, and the
 * asker holds `tenants.view`.
 */
export function corpus(d: DB, user: User): Doc[] {
  const docs: Doc[] = [];

  const unitOf = (id: string) => d.units.find((u) => u.id === id);
  const tenantOf = (id: string) => d.tenants.find((t) => t.id === id);
  const propOf = (id: string) => d.properties.find((p) => p.id === id);

  if (can(user.role, "properties.view")) {
    for (const p of d.properties) {
      const units = d.units.filter((u) => u.propertyId === p.id);
      const occ = units.filter((u) => u.status === "occupied").length;
      docs.push({
        id: p.id,
        kind: "property",
        text:
          `Property ${p.name} (code ${p.code}) in ${p.area}, ${p.city}. ` +
          `Owner ${p.owner}. ${p.floors} floors, built ${p.yearBuilt}. ` +
          `${occ} of ${units.length} units occupied. Address ${p.address}.`,
      });
    }

    for (const u of d.units) {
      const prop = propOf(u.propertyId);
      docs.push({
        id: u.id,
        kind: "unit",
        text:
          `Unit ${u.unitNo} in ${prop?.name ?? "unknown property"} ` +
          `(${prop?.code ?? "?"}), floor ${u.floor}, type ${u.type}, ` +
          `${u.sizeSqft} sqft, ${u.bathrooms} bathrooms, ` +
          `${u.parkingSlots} parking. Status ${u.status}. ` +
          `Market rent ${AED(u.marketRent)}.`,
      });
    }
  }

  if (can(user.role, "tenants.view")) {
    for (const t of d.tenants) {
      docs.push({
        id: t.id,
        kind: "tenant",
        text:
          `Tenant ${t.name}, ${t.kind}, nationality ${t.nationality}. ` +
          `Phone ${t.phone}, email ${t.email}.` +
          (t.tradeLicense ? ` Trade licence ${t.tradeLicense}.` : ""),
      });
    }
  }

  if (can(user.role, "contracts.view")) {
    for (const c of d.contracts) {
      const u = unitOf(c.unitId);
      const t = tenantOf(c.tenantId);
      docs.push({
        id: c.id,
        kind: "contract",
        text:
          `Contract ${c.ref} (Ejari ${c.ejariNo}) for unit ` +
          `${u?.unitNo ?? "?"}, tenant ${t?.name ?? "?"}. ` +
          `Status ${c.status}. Runs ${fmtDate(c.startDate)} to ` +
          `${fmtDate(c.endDate)}. Annual rent ${AED(c.annualRent)} over ` +
          `${c.chequeCount} cheques. Deposit ${AED(c.securityDeposit)}.`,
      });
    }
  }

  if (can(user.role, "cheques.view")) {
    for (const c of d.cheques) {
      const contract = d.contracts.find((k) => k.id === c.contractId);
      const t = contract ? tenantOf(contract.tenantId) : undefined;
      const u = contract ? unitOf(contract.unitId) : undefined;
      docs.push({
        id: c.id,
        kind: "cheque",
        text:
          `Cheque ${c.chequeNo} drawn on ${c.bank} for ${AED(c.amount)}, ` +
          `number ${c.seq} of ${c.ofTotal}. Due ${fmtDate(c.dueDate)}. ` +
          `Status ${c.status}. Tenant ${t?.name ?? "?"}, unit ` +
          `${u?.unitNo ?? "?"}, contract ${contract?.ref ?? "?"}.`,
      });
    }
  }

  // Tasks are how "what has X been doing" gets answered, so they carry the
  // assignee's name rather than only their id.
  for (const t of d.tasks) {
    const who = d.users.find((u) => u.id === t.assignedTo);
    docs.push({
      id: t.id,
      kind: "task",
      text:
        `Task "${t.title}" assigned to ${who?.name ?? "nobody"} ` +
        `(${who?.role ?? "-"}). Status ${t.status}, priority ${t.priority}, ` +
        `due ${fmtDate(t.dueDate)}. ${t.detail}`,
    });
  }

  if (can(user.role, "audit.view")) {
    for (const a of d.audit.slice(0, 200)) {
      docs.push({
        id: a.id,
        kind: "audit",
        text: `${a.actorName} ${a.summary} on ${a.at} (record ${a.entityId}).`,
      });
    }
  }

  return docs;
}

/* -------------------------------------------------------------------- BM25 */

const K1 = 1.5; // term-frequency saturation
const B = 0.75; // length normalisation

/**
 * Ranks the corpus against a query with Okapi BM25.
 *
 * The index is rebuilt per call. That is deliberate rather than lazy: the
 * corpus is a few thousand short documents built from live in-memory data, so
 * scoring costs single-digit milliseconds, and a cached index would go stale
 * the moment a cheque was deposited.
 */
export function retrieve(docs: Doc[], query: string, topK = 12): Retrieved[] {
  const qTerms = tokenise(query);
  if (qTerms.length === 0 || docs.length === 0) return [];

  const tokens = docs.map((d) => tokenise(d.text));
  const lengths = tokens.map((t) => t.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / docs.length;

  // Document frequency for the query terms only — no need to index the rest.
  const unique = [...new Set(qTerms)];
  const df = new Map<string, number>();
  const termCounts = tokens.map((toks) => {
    const counts = new Map<string, number>();
    for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  });
  for (const term of unique) {
    let n = 0;
    for (const counts of termCounts) if (counts.has(term)) n += 1;
    df.set(term, n);
  }

  const scored: Retrieved[] = docs.map((doc, i) => {
    let score = 0;
    for (const term of unique) {
      const n = df.get(term) ?? 0;
      if (n === 0) continue;
      const f = termCounts[i].get(term) ?? 0;
      if (f === 0) continue;
      // BM25 IDF, the +0.5 variant that stays positive for common terms.
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      const norm = f * (K1 + 1);
      const denom = f + K1 * (1 - B + (B * lengths[i]) / avgLen);
      score += idf * (norm / denom);
    }
    return { ...doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Formats retrieved records for the prompt, or empty string if nothing hit. */
export function retrievedBlock(d: DB, user: User, query: string, topK = 12): string {
  const hits = retrieve(corpus(d, user), query, topK);
  if (hits.length === 0) return "";
  return (
    `\n## Records matching this question\n` +
    `These were looked up from live data for this question specifically. ` +
    `Prefer them over the summary figures above when answering about a ` +
    `named record, and do not mention records that are not listed here.\n` +
    hits.map((h) => `- [${h.kind}] ${h.text}`).join("\n")
  );
}
