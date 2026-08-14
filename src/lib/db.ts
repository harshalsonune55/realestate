import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Single shared Postgres pool.
 *
 * Next dev reloads modules on every edit, which would otherwise open a new pool
 * per reload until Postgres refuses connections, so the pool is parked on
 * globalThis the same way the old JSON cache was.
 */
const g = globalThis as unknown as { __pmsPool?: Pool };

export function pool(): Pool {
  g.__pmsPool ??= new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://localhost:5432/almanara_pms",
    max: 10,
    idleTimeoutMillis: 30_000,
    // Managed Postgres (Render, Supabase, Neon) terminates plaintext
    // connections; local development has no certificate to verify against.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return g.__pmsPool;
}

/** Runs a query and returns the rows. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

/** Runs a query expected to match at most one row. */
export async function q1<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction, rolling back if it throws.
 *
 * Used wherever one user action writes several tables — recording a deposit
 * updates the cheque, closes its task, inserts a payment, writes the activity
 * log and notifies the administrator. A partial write there would leave money
 * unaccounted for.
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------- money */

/** AED → fils. Money is stored as integer fils to avoid float drift. */
export const toFils = (aed: number) => Math.round(aed * 100);

/** fils → AED. */
export const toAed = (fils: number | string | null | undefined) =>
  fils == null ? 0 : Number(fils) / 100;
