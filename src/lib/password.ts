// Deliberately not marked "server-only": this is pure crypto with no request
// context, and the seed/migration scripts import it outside the Next runtime.
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;

/**
 * scrypt from node's standard library rather than bcrypt/argon2.
 *
 * bcrypt is a native module that has to compile against the local toolchain and
 * breaks on Node upgrades and on hosts without build tools. scrypt is memory-
 * hard, built in, and needs no dependency at all.
 *
 * Format: scrypt$<salt-hex>$<hash-hex> — self-describing, so the algorithm can
 * be changed later without a flag-day migration.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);

  // Constant-time: a plain === leaks how much of the hash matched via timing.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Blocking problems with a proposed password, empty when acceptable. */
export function passwordProblems(password: string): string[] {
  const out: string[] = [];
  if (password.length < 10) out.push("Use at least 10 characters.");
  if (!/[a-z]/.test(password)) out.push("Include a lower-case letter.");
  if (!/[A-Z]/.test(password)) out.push("Include an upper-case letter.");
  if (!/[0-9]/.test(password)) out.push("Include a number.");
  return out;
}
