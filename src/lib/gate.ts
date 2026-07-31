// A single shared password in front of the whole site, used when the prototype is
// hosted somewhere public. Set PMS_ACCESS_PASSWORD to switch it on; leave it unset
// (as on a local machine) and the gate disappears entirely.
//
// This is a front door, not user authentication — the staff sign-in behind it is
// still the account picker. Both are replaced by real logins before live use.

export const GATE_COOKIE = "pms_gate";

/** Web Crypto so the same helper runs in middleware (edge) and in a server action. */
export async function gateToken(secret: string) {
  const bytes = new TextEncoder().encode("al-manara-pms-gate:" + secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
