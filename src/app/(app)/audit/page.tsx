import Link from "next/link";
import { ScrollText, Search, ShieldCheck } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/store";
import { cx, fmtDateTime, titleCase } from "@/lib/utils";
import { Badge, Card, CardHead, Empty, PageHead, Stat, Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const ACTION_TONE = (action: string): Tone => {
  if (action.includes("reject") || action.includes("bounce")) return "bad";
  if (action.includes("approve") || action.includes("cleared") || action.includes("completed")) return "good";
  if (action.includes("created") || action.includes("submitted")) return "info";
  return "neutral";
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; actor?: string; entity?: string; page?: string }>;
}) {
  await requirePerm("audit.view");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const actor = sp.actor ?? "all";
  const entity = sp.entity ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1));

  const d = db();
  let rows = [...d.audit].sort((a, b) => (a.at < b.at ? 1 : -1));

  if (actor !== "all") rows = rows.filter((a) => a.actorId === actor);
  if (entity !== "all") rows = rows.filter((a) => a.entityType === entity);
  if (q)
    rows = rows.filter(
      (a) =>
        a.summary.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q) ||
        a.entityId.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q)
    );

  const entities = Array.from(new Set(d.audit.map((a) => a.entityType))).sort();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const link = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    Object.entries({ q: sp.q, actor, entity, ...params }).forEach(([k, v]) => {
      if (v && v !== "all") u.set(k, v);
    });
    const s = u.toString();
    return "/audit" + (s ? "?" + s : "");
  };

  const todayCount = d.audit.filter((a) => a.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  const entityHref = (t: string, id: string) => {
    switch (t) {
      case "contract":
        return `/contracts/${id}`;
      case "cheque":
        return `/cheques/${id}`;
      case "tenant":
        return `/tenants/${id}`;
      case "maintenance":
        return `/maintenance/${id}`;
      case "approval":
        return "/approvals";
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHead
        title="Audit log"
        sub="Every action taken in this system, by whom, from where and when. Entries cannot be edited or deleted by anyone, including administrators."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entries" value={d.audit.length.toLocaleString("en-US")} sub="all time" />
        <Stat label="Today" value={String(todayCount)} sub="actions recorded" />
        <Stat label="Employees tracked" value={String(new Set(d.audit.map((a) => a.actorId)).size)} />
        <Stat label="Retention" value="7 years" sub="immutable storage" tone="good" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <form action="/audit" className="relative">
              <input type="hidden" name="actor" value={actor} />
              <input type="hidden" name="entity" value={entity} />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Action, employee or record id…"
                className="h-9 w-72 rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </form>
            <p className="tnum ml-auto text-[12.5px] text-muted">{rows.length.toLocaleString("en-US")} entries</p>
          </div>

          <div className="divide-y divide-line-soft">
            {pageRows.length === 0 ? (
              <div className="p-5">
                <Empty title="No entries match" icon={<ScrollText size={22} />} />
              </div>
            ) : (
              pageRows.map((a) => {
                const href = entityHref(a.entityType, a.entityId);
                return (
                  <div key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-[10.5px] font-semibold text-fg-soft">
                      {a.actorName.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-fg">
                        <b className="font-semibold">{a.actorName}</b> — {a.summary}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                        <span>{fmtDateTime(a.at)}</span>
                        <span className="tnum">IP {a.ip}</span>
                        {href ? (
                          <Link href={href} className="tnum text-brand-600 hover:underline">
                            {a.entityType}/{a.entityId}
                          </Link>
                        ) : (
                          <span className="tnum">
                            {a.entityType}/{a.entityId}
                          </span>
                        )}
                      </div>
                      {a.changes && a.changes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 rounded-lg bg-subtle px-2.5 py-1.5">
                          {a.changes.map((c, i) => (
                            <li key={i} className="text-[11px] text-fg-soft">
                              <b className="font-medium text-fg">{c.field}</b>{" "}
                              <span className="text-faint line-through">{c.from}</span> →{" "}
                              <b className="font-medium">{c.to}</b>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Badge tone={ACTION_TONE(a.action)}>{a.action}</Badge>
                  </div>
                );
              })
            )}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12.5px]">
              <span className="text-muted">Page {page} of {pages}</span>
              <div className="flex gap-2">
                <Link href={link({ page: String(Math.max(1, page - 1)) })} className={cx("rounded-lg border border-line px-3 py-1.5", page === 1 && "pointer-events-none opacity-40")}>
                  Previous
                </Link>
                <Link href={link({ page: String(Math.min(pages, page + 1)) })} className={cx("rounded-lg border border-line px-3 py-1.5", page === pages && "pointer-events-none opacity-40")}>
                  Next
                </Link>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="Filter by employee" />
            <div className="space-y-1">
              <Link
                href={link({ actor: "all", page: undefined })}
                className={cx(
                  "block rounded-lg px-2.5 py-1.5 text-[12.5px]",
                  actor === "all" ? "bg-inverse text-white" : "hover:bg-subtle"
                )}
              >
                Everyone
              </Link>
              {d.users.map((u) => (
                <Link
                  key={u.id}
                  href={link({ actor: u.id, page: undefined })}
                  className={cx(
                    "block truncate rounded-lg px-2.5 py-1.5 text-[12.5px]",
                    actor === u.id ? "bg-inverse text-white" : "text-fg-soft hover:bg-subtle"
                  )}
                >
                  {u.name}
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Filter by record type" />
            <div className="flex flex-wrap gap-1.5">
              {["all", ...entities].map((e) => (
                <Link
                  key={e}
                  href={link({ entity: e, page: undefined })}
                  className={cx(
                    "rounded-lg border px-2.5 py-1 text-[12px]",
                    entity === e ? "border-inverse bg-inverse text-white" : "border-line text-fg-soft hover:bg-subtle"
                  )}
                >
                  {titleCase(e)}
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Why this matters" icon={<ShieldCheck size={17} />} />
            <p className="text-[12.5px] leading-relaxed text-fg-soft">
              If money goes missing, a cheque is not banked, or a contract is signed at the wrong
              rent, this log answers the only question that matters: who did it, and when. Nobody
              in the company can remove an entry.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
