import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DB, type Role } from "./types";
import { generate } from "./seed";
import { pickAssignee, type Candidate } from "./assign";

// On Render (or any host with an ephemeral filesystem) point PMS_DATA_DIR at a
// mounted persistent disk, otherwise changes are lost every time the app restarts.
const DATA_DIR = process.env.PMS_DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

type Cache = { db: DB | null; warned?: boolean };
const g = globalThis as unknown as { __pmsCache?: Cache };
g.__pmsCache ??= { db: null };

/**
 * Refuses to serve the JSON store when a real database is configured.
 *
 * `DATABASE_URL` being set is what makes an installation a real one. If any
 * code path still reached this file after that, a business record would be
 * written to a file nobody reads and the user would be told it was saved. The
 * repository seam in `data.ts` already routes around it; this is the backstop
 * that turns a mistake into a crash instead of into lost data.
 */
function assertNotProduction(): void {
  if (process.env.DATABASE_URL) {
    throw new Error(
      "The JSON store was used while DATABASE_URL is set. Postgres is the " +
        "authoritative store; this write or read would have been lost. Route " +
        "the call through src/lib/data.ts or the repositories in src/lib/repos."
    );
  }
}

function load(): DB {
  assertNotProduction();
  if (g.__pmsCache!.db) return g.__pmsCache!.db;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      g.__pmsCache!.db = JSON.parse(raw) as DB;
      return g.__pmsCache!.db!;
    }
  } catch {
    // fall through and regenerate
  }
  const fresh = generate();
  g.__pmsCache!.db = fresh;
  persist();
  return fresh;
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(g.__pmsCache!.db), "utf8");
  } catch (err) {
    // Read-only filesystem: keep working from memory so the demo still runs.
    // Said out loud once, because "changes vanish on restart" is not something
    // anyone should have to discover for themselves. This branch is
    // unreachable with DATABASE_URL set — see `assertNotProduction`.
    if (!g.__pmsCache!.warned) {
      g.__pmsCache!.warned = true;
      console.warn(
        `[pms] Demo data could not be written to ${DB_FILE} (${
          err instanceof Error ? err.message : String(err)
        }). Running from memory: changes will be lost when the process restarts. ` +
          "Set DATABASE_URL to store data in Postgres."
      );
    }
  }
}

/** Read-only handle to the database. */
export function db(): DB {
  return load();
}

/** Mutate the database and persist the result. */
export function write<T>(fn: (d: DB) => T): T {
  const d = load();
  const result = fn(d);
  persist();
  return result;
}

/**
 * Who should get the next task, in the JSON store.
 *
 * The mirror of `assigneeFor` on the Postgres side, and it exists because the
 * JSON paths were worse still: they named people by literal id — `"U8"` for
 * every maintenance follow-up, `"U2"` for every cheque one. That is fine
 * against seeded demo data and wrong the moment a real team exists, because
 * those ids may be somebody who left.
 */
export function pickAssigneeJson(
  roles: Role[],
  preferred?: string | null
): string | null {
  const d = load();
  const now = Date.now();

  const candidates: Candidate[] = d.users
    .filter((u) => u.active && roles.includes(u.role))
    .map((u) => {
      const mine = d.tasks.filter((t) => t.assignedTo === u.id);
      const last = mine.reduce(
        (m, t) => Math.max(m, Date.parse(t.createdAt) || 0),
        0
      );
      return {
        id: u.id,
        role: u.role,
        open: mine.filter((t) => t.status !== "done").length,
        overdue: mine.filter((t) => t.status === "overdue").length,
        lastAssignedAt: last || now,
      };
    });

  return pickAssignee(candidates, roles, preferred);
}

/** Next id for a given entity counter, e.g. nextId("contract", "C") -> "C412". */
export function nextId(counter: string, prefix: string): string {
  const d = load();
  d.counters[counter] = (d.counters[counter] ?? 1) + 1;
  return prefix + d.counters[counter];
}

export function resetDatabase() {
  g.__pmsCache!.db = generate();
  persist();
}
