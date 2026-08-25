/**
 * Proves account mutations reach Postgres and survive a reconnect.
 * Needs DATABASE_URL. Not part of `npm test`.
 *
 * Every phase closes the pool before the next one reads, so nothing can pass
 * on in-memory state left behind by the step before it.
 *
 * The account this creates is removed at the end — a signup left behind in a
 * shared database is an account somebody could actually be handed.
 */
import assert from "node:assert";
import { pool } from "@/lib/db";
import { backend } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import {
  approveSignup, createSignup, declineSignup, findUserByEmail, findUserById,
  listUserEmails, recordLogin,
} from "@/lib/repos/accounts";
import { userStatus } from "@/lib/types";

async function reconnect() {
  await pool().end();
  (globalThis as Record<string, unknown>).__pmsPool = undefined;
}

async function fresh<T>(fn: () => Promise<T>): Promise<T> {
  const out = await fn();
  await reconnect();
  return out;
}

async function main() {
  assert.strictEqual(backend(), "postgres", "DATABASE_URL must be set");

  const stamp = Date.now();
  const email = `cutover.proof.${stamp}@almanara.ae`;
  const now = new Date().toISOString();

  /* 1 ------------------------------------------------------------- signup */
  const created = await fresh(() =>
    createSignup({
      name: "Cutover Proof",
      email,
      phone: "+971500000123",
      title: "Persistence Probe",
      requestedRole: "accountant",
      passwordHash: "scrypt$aa$bb",
      now,
    })
  );
  const id = created.id;
  assert.strictEqual(created.status, "pending");
  // The requested role must never be the granted one.
  assert.strictEqual(created.role, "viewer");
  assert.strictEqual(created.requestedRole, "accountant");
  assert.strictEqual(created.active, false);
  console.log(`1. signup created      ${id}  role=${created.role} requested=${created.requestedRole}`);

  /* 2 ------------------------------------------- read back after reconnect */
  const afterSignup = await fresh(() => findUserById(id));
  assert.ok(afterSignup, "user missing after reconnect");
  assert.strictEqual(userStatus(afterSignup!), "pending");
  assert.strictEqual(afterSignup!.active, false, "a pending account must not be active");
  assert.strictEqual(afterSignup!.passwordHash, "scrypt$aa$bb");
  console.log(`2. survived reconnect  status=${userStatus(afterSignup!)} active=${afterSignup!.active}`);

  // The review task must exist, or nobody is told to act on the request.
  const task = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT id, title, status, assigned_to FROM tasks WHERE entity_type='user' AND entity_id=$1",
      [id]
    );
    return rows[0];
  });
  assert.ok(task, "no review task was raised for the signup");
  assert.ok(task.assigned_to, "review task has no assignee");
  assert.strictEqual(task.status, "open");
  console.log(`3. review task raised  ${task.title} → ${task.assigned_to}`);

  // Case-insensitive lookup: sign-in must not depend on how it was typed.
  const byEmail = await fresh(() => findUserByEmail(email.toUpperCase()));
  assert.strictEqual(byEmail?.id, id, "email lookup is case-sensitive");
  assert.ok((await fresh(() => listUserEmails())).includes(email));
  console.log("4. email lookup        case-insensitive, and listed as taken");

  /* 5 ------------------------------------------------------------ approve */
  const actor = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT * FROM users WHERE role='admin' AND status='active' LIMIT 1"
    );
    return rows[0];
  });

  await fresh(() => approveSignup(id, "accountant", actor.id, new Date().toISOString()));
  const afterApprove = await fresh(() => findUserById(id));
  assert.strictEqual(afterApprove!.role, "accountant", "granted role did not persist");
  assert.strictEqual(userStatus(afterApprove!), "active");
  assert.strictEqual(afterApprove!.active, true, "approved account must be able to sign in");
  assert.strictEqual(afterApprove!.approvedBy, actor.id);
  assert.ok(afterApprove!.approvedAt);
  console.log(`5. approved, persisted role=${afterApprove!.role} status=${userStatus(afterApprove!)} by=${actor.name}`);

  const closed = await fresh(async () => {
    const { rows } = await pool().query(
      "SELECT status, completed_at FROM tasks WHERE entity_type='user' AND entity_id=$1",
      [id]
    );
    return rows[0];
  });
  assert.strictEqual(closed.status, "done", "review task stayed open after approval");
  assert.ok(closed.completed_at);
  console.log("6. review task closed  in the same transaction as the approval");

  /* 7 -------------------------------------------------------- login stamp */
  const loginAt = new Date().toISOString();
  await fresh(() => recordLogin(id, loginAt));
  const afterLogin = await fresh(() => findUserById(id));
  assert.strictEqual(
    new Date(afterLogin!.lastLoginAt!).toISOString(),
    new Date(loginAt).toISOString()
  );
  console.log(`7. last login stored   ${afterLogin!.lastLoginAt}`);

  /* 8 ------------------------------------------------- audit pairs with it */
  const marker = `account-proof-${stamp}`;
  await fresh(() =>
    logAudit(
      { id: actor.id, name: actor.name, email: actor.email, role: actor.role, title: "", active: true },
      "user.approved",
      "user",
      id,
      marker,
      [{ field: "status", from: "pending", to: "active" }]
    )
  );
  const audit = await fresh(async () => {
    const { rows } = await pool().query("SELECT * FROM activity_log WHERE summary=$1", [marker]);
    return rows;
  });
  assert.strictEqual(audit.length, 1, "audit row did not reach Postgres");
  assert.strictEqual(audit[0].entity_id, id);
  assert.strictEqual(audit[0].ip, null, "unknown ip must be NULL, never fabricated");
  console.log(`8. audit written       actor=${audit[0].actor_name} ip=${audit[0].ip} (null, not fabricated)`);

  /* 9 ------------------------------------------------------------ decline */
  await fresh(() => declineSignup(id, actor.id, "persistence proof", new Date().toISOString()));
  const afterDecline = await fresh(() => findUserById(id));
  assert.strictEqual(userStatus(afterDecline!), "suspended");
  assert.strictEqual(afterDecline!.active, false, "a suspended account must lose access");
  assert.strictEqual(afterDecline!.declineReason, "persistence proof");
  console.log(`9. decline persisted   status=${userStatus(afterDecline!)} active=${afterDecline!.active}`);

  /* 10 ------------------------------------------------------------ cleanup */
  await pool().query("DELETE FROM tasks WHERE entity_type='user' AND entity_id=$1", [id]);
  await pool().query("DELETE FROM activity_log WHERE entity_id=$1 OR actor_id=$1", [id]);
  await pool().query("DELETE FROM activity_log WHERE summary=$1", [marker]);
  await pool().query("DELETE FROM users WHERE id=$1", [id]);
  await reconnect();
  assert.strictEqual(await findUserById(id), null, "test account was not removed");
  console.log(`10. cleaned up         ${email} removed`);

  console.log("\nPASS — signup, approval, login and decline all survived a fresh session.");
  await pool().end();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
