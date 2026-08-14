import "server-only";
import { db } from "./store";
import { kpis } from "./queries";
import { can } from "./rbac";
import type { User } from "./types";

/** Chat turn as exchanged with the browser and forwarded to the provider. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Builds the briefing the model answers from.
 *
 * Every block is gated on the same permission that gates the corresponding
 * page, so the assistant can never become a way around RBAC — an accountant
 * asking about staff access gets the same "I don't have that" as they would
 * get by navigating to the page.
 */
export function briefing(user: User): string {
  const d = db();
  const k = kpis();
  const out: string[] = [];

  out.push(
    "You are the assistant inside Aber Group's property management system " +
      "(Al Manara PMS). Answer questions about this company's portfolio, " +
      "staff and processes using only the briefing below. If something is " +
      "not in the briefing, say you do not have that information rather than " +
      "guessing. Amounts are in AED. Keep answers short and concrete, and " +
      "prefer plain sentences over bullet lists unless asked for a list."
  );

  out.push(
    `\n## Who you are talking to\n` +
      `Name: ${user.name}\nTitle: ${user.title}\nRole: ${user.role}\n` +
      `Email: ${user.email}\n` +
      `This person may only be told what their role permits. Do not reveal ` +
      `anything excluded from the briefing.`
  );

  out.push(
    `\n## Portfolio\n` +
      `Properties: ${d.properties.length}\n` +
      `Units: ${k.totalUnits} (${k.occupied} occupied, ` +
      `${(k.occupancy * 100).toFixed(1)}% occupancy)`
  );

  for (const p of d.properties) {
    const units = d.units.filter((u) => u.propertyId === p.id);
    const occ = units.filter((u) => u.status === "occupied").length;
    out.push(
      `- ${p.name} (${p.code}), ${p.area}, ${p.city}: ` +
        `${occ}/${units.length} units occupied, owner ${p.owner}`
    );
  }

  if (can(user.role, "contracts.view")) {
    out.push(
      `\n## Contracts\n` +
        `Total: ${d.contracts.length}\n` +
        `Active: ${k.activeContracts}\n` +
        `Annualised rent roll: AED ${Math.round(k.annualised)}\n` +
        `Expiring within 90 days: ${k.expiring90}`
    );
  }

  if (can(user.role, "cheques.view")) {
    out.push(
      `\n## Cheques\n` +
        `Total held: ${d.cheques.length}\n` +
        `Cleared: ${k.chequesCleared}\n` +
        `Collected over 12 months: AED ${Math.round(k.collected)}\n` +
        `Outstanding: AED ${Math.round(k.outstanding)}\n` +
        `At risk (overdue + bounced): AED ${Math.round(k.atRisk)}`
    );
  }

  if (can(user.role, "tenants.view")) {
    // Names only. Phone numbers, Emirates IDs and passport numbers are
    // deliberately withheld — the chat box is not an export route for PII.
    out.push(
      `\n## Tenants\nCount: ${d.tenants.length}\n` +
        d.tenants
          .slice(0, 40)
          .map((t) => `- ${t.name} (${t.kind})`)
          .join("\n")
    );
  }

  if (can(user.role, "approvals.view")) {
    out.push(`\n## Approvals\nPending: ${k.pendingApprovals}`);
  }

  out.push(
    `\n## Employees\n` +
      `Never disclose passwords or password hashes.\n` +
      d.users
        .filter((u) => u.active)
        .map((u) => `- ${u.name} — ${u.title} (${u.role})`)
        .join("\n")
  );

  /* ------------------------------------------------------------ workload
     The cross-employee view is the one an HR or line-management question
     needs ("who is behind?", "what has Priya closed?"). It is gated on
     admin.users because a per-person productivity breakdown is management
     information, not something every colleague should be able to pull. */
  if (can(user.role, "admin.users")) {
    const lines = d.users
      .filter((u) => u.active)
      .map((u) => {
        const mine = d.tasks.filter((t) => t.assignedTo === u.id);
        const done = mine.filter((t) => t.status === "done").length;
        const overdue = mine.filter((t) => t.status === "overdue").length;
        const open = mine.filter((t) => t.status !== "done").length;
        const acted = d.audit.filter((a) => a.actorName === u.name).length;
        return (
          `- ${u.name} (${u.role}): ${open} open, ${overdue} overdue, ` +
          `${done} completed, ${acted} recorded actions`
        );
      });

    out.push(
      `\n## Employee workload\n` +
        `Task counts per employee across the whole team.\n` +
        lines.join("\n")
    );

    const completed = d.tasks
      .filter((t) => t.status === "done")
      .slice(0, 20)
      .map((t) => {
        const who = d.users.find((u) => u.id === t.assignedTo);
        return `- ${who?.name ?? "Unassigned"}: ${t.title}`;
      });
    if (completed.length > 0) {
      out.push(`\n## Recently completed work\n` + completed.join("\n"));
    }

    const unassigned = d.tasks.filter(
      (t) => t.status !== "done" && !d.users.some((u) => u.id === t.assignedTo)
    ).length;
    if (unassigned > 0) {
      out.push(`\nUnassigned open tasks: ${unassigned}`);
    }
  }

  if (can(user.role, "audit.view")) {
    out.push(
      `\n## Recent activity\n` +
        d.audit
          .slice(0, 12)
          .map((a) => `- ${a.actorName}: ${a.summary} (${a.at})`)
          .join("\n")
    );
  }

  const mine = d.tasks.filter(
    (t) => t.assignedTo === user.id && t.status !== "done"
  );
  if (mine.length > 0) {
    out.push(
      `\n## This person's open tasks\n` +
        mine
          .slice(0, 10)
          .map((t) => `- ${t.title} (${t.status}, due ${t.dueDate}) — ${t.detail}`)
          .join("\n")
    );
  }

  return out.join("\n");
}
