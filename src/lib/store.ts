import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DB } from "./types";
import { generate } from "./seed";

// On Render (or any host with an ephemeral filesystem) point PMS_DATA_DIR at a
// mounted persistent disk, otherwise changes are lost every time the app restarts.
const DATA_DIR = process.env.PMS_DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

type Cache = { db: DB | null };
const g = globalThis as unknown as { __pmsCache?: Cache };
g.__pmsCache ??= { db: null };

function load(): DB {
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
  } catch {
    // read-only filesystem: keep working from memory only
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
