import "server-only";
import { kpis } from "./queries";
import { today } from "./utils";
import { can } from "./rbac";
import { userStatus, type DB, type User } from "./types";

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
/**
 * A short briefing, for turns that carry an image.
 *
 * Vision models are billed and rate-limited on the whole prompt, and the image
 * itself is most of it. Sending the full portfolio dump alongside a photo
 * spends the entire per-minute budget on context the question does not need,
 * and the request fails outright. This keeps who is asking and what the system
 * is — enough to stay grounded — and lets the picture have the rest.
 */
export function compactBriefing(d: DB, user: User): string {
  const k = kpis(d);
  return (
    "You are the assistant inside Aber Group's property management system " +
      "(Al Manara PMS). The user has attached one or more images to this " +
      "message; read them and answer from what you can see. Amounts are in " +
      "AED. Keep answers short and concrete.\n" +
      "If the question needs company records rather than the image, say you " +
      "need it asked without the attachment, so the full briefing is available.\n\n" +
      `## Who you are talking to\n` +
      `Name: ${user.name}\nTitle: ${user.title}\nRole: ${user.role}\n\n` +
      `## The portfolio, in one line\n` +
      `${d.properties.length} properties, ${k.totalUnits} units, ` +
      `${k.occupied} occupied (${(k.occupancy * 100).toFixed(1)}%).`
  );
}

export function briefing(d: DB, user: User): string {
  const k = kpis(d);
  const out: string[] = [];

  out.push(
    "You are the assistant inside Aber Group's property management system " +
      "(Al Manara PMS). Answer questions about this company's portfolio, " +
      "staff and processes using only the briefing below. If something is " +
      "not in the briefing, say you do not have that information rather than " +
      "guessing. Amounts are in AED. Keep answers short and concrete, and " +
      "prefer plain sentences over bullet lists unless asked for a list.\n" +
      "When you are asked who is in the office, be precise about what the " +
      "system actually knows: it records sign-ins to this application and the " +
      "actions people take in it, not door entry or physical attendance. " +
      "Answer from that and say so — never present system activity as proof " +
      "somebody was on the premises.\n" +
      "When you are asked who is performing well, give the figures behind the " +
      "judgement rather than a verdict on its own, and note that task counts " +
      "measure recorded workload, not the quality or difficulty of the work."
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

    /* ------------------------------------------------------- the roster
       Titles, status and the last recorded sign-in, so "who works here"
       and "who has been around" are answerable without the model having to
       infer either from the workload table above. */
    out.push(
      `\n## Staff roster\n` +
        d.users
          .map((u) => {
            // The same derivation the roster page uses, so the assistant and
            // the screen never disagree about whether somebody is on staff.
            const s = userStatus(u);
            const state = s === "pending" ? "awaiting approval" : s;
            const seen = u.lastLoginAt
              ? `last signed in ${u.lastLoginAt}`
              : "never signed in";
            return `- ${u.name} — ${u.title} (${u.role}), ${state}, ${seen}` +
              (u.email ? `, ${u.email}` : "");
          })
          .join("\n")
    );

    /* --------------------------------------------------------- presence
       The honest answer to "who is in today": who has done something in the
       system today, and between which hours. It is an activity window, not
       an attendance record, and the system prompt says so. */
    const todayKey = today();
    const byPerson = new Map<string, { first: string; last: string; n: number }>();
    for (const a of d.audit) {
      if (!a.at.startsWith(todayKey)) continue;
      const seen = byPerson.get(a.actorName);
      if (!seen) {
        byPerson.set(a.actorName, { first: a.at, last: a.at, n: 1 });
      } else {
        seen.n += 1;
        if (a.at < seen.first) seen.first = a.at;
        if (a.at > seen.last) seen.last = a.at;
      }
    }
    out.push(
      `\n## Activity in the system today (${todayKey})\n` +
        `Derived from the audit trail — sign-ins and recorded actions, not ` +
        `physical attendance.\n` +
        (byPerson.size === 0
          ? "Nobody has recorded an action today."
          : [...byPerson.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .map(
                ([name, w]) =>
                  `- ${name}: ${w.n} action${w.n === 1 ? "" : "s"}, ` +
                  `first ${w.first.slice(11, 16)}, last ${w.last.slice(11, 16)}`
              )
              .join("\n")) +
        `\nSigned in today: ` +
        (d.users.filter((u) => u.lastLoginAt?.startsWith(todayKey)).length === 0
          ? "nobody on record"
          : d.users
              .filter((u) => u.lastLoginAt?.startsWith(todayKey))
              .map((u) => `${u.name} (${u.lastLoginAt!.slice(11, 16)})`)
              .join(", "))
    );

    /* ---------------------------------------------------- work in flight
       What is actually open right now, and who is holding it. */
    const openMaint = d.maintenance.filter(
      (m) => !["closed", "completed", "rejected"].includes(m.status)
    );
    const pendingApprovals = d.approvals.filter((a) => a.status === "pending");
    const upcomingVisits = (d.visits ?? []).filter(
      (v) => v.status === "scheduled" || v.status === "confirmed"
    );

    out.push(
      `\n## Work currently in flight\n` +
        `Open maintenance jobs: ${openMaint.length}\n` +
        openMaint
          .slice(0, 15)
          .map((m) => {
            const who = d.users.find((u) => u.id === m.assignedTo);
            const unit = d.units.find((x) => x.id === m.unitId);
            return (
              `- ${m.ref} ${m.category} (${m.priority}, ${m.status})` +
              `${unit ? ` at unit ${unit.unitNo}` : ""}` +
              ` — ${who?.name ?? "unassigned"}, SLA ${m.slaDueAt.slice(0, 10)}`
            );
          })
          .join("\n") +
        `\n\nApprovals waiting on a decision: ${pendingApprovals.length}\n` +
        pendingApprovals
          .slice(0, 15)
          .map((a) => {
            const who = d.users.find((u) => u.id === a.requestedBy);
            return `- ${a.ref} ${a.type}: ${a.title} — raised by ${who?.name ?? a.requestedBy} on ${a.requestedAt.slice(0, 10)}`;
          })
          .join("\n") +
        `\n\nViewings booked: ${upcomingVisits.length}\n` +
        upcomingVisits
          .slice(0, 15)
          .map((v) => {
            const who = d.users.find((u) => u.id === v.bookedBy);
            const unit = d.units.find((x) => x.id === v.unitId);
            return (
              `- ${v.ref} ${v.visitorName}` +
              `${unit ? ` at unit ${unit.unitNo}` : ""}` +
              ` on ${v.startsAt.slice(0, 16).replace("T", " ")} — booked by ${who?.name ?? v.bookedBy}`
            );
          })
          .join("\n")
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
