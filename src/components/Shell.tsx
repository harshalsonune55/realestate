"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ListChecks, Building2, DoorOpen, Users, FileSignature,
  RefreshCw, Landmark, Receipt, Wrench, ShieldCheck, BarChart3, ScrollText,
  UserCog, LogOut, Menu, X, BellRing, ChevronRight, Sparkles, CalendarClock,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import CommandPalette from "./CommandPalette";
import { Monogram } from "./Brand";

const ICONS = {
  LayoutDashboard, ListChecks, Building2, DoorOpen, Users, FileSignature,
  RefreshCw, Landmark, Receipt, Wrench, ShieldCheck, BarChart3, ScrollText, UserCog,
  Sparkles, CalendarClock,
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
  badgeTone?: "red" | "amber" | "slate";
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export default function Shell({
  user,
  groups,
  alertCount,
  children,
}: {
  user: { name: string; role: Role; title: string };
  groups: NavGroup[];
  alertCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  /* Light, minimal sidebar: rounded pills, a soft-shadow active state, and
     dark count badges — clean and uncluttered. */
  const nav = (
    <nav className="scroll-thin flex-1 overflow-y-auto px-3.5 py-4">
      {groups.map((g) => (
        <div key={g.title} className="mb-4">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            {g.title}
          </p>
          <ul className="space-y-1">
            {g.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[14px] transition",
                      active
                        ? "bg-surface font-semibold text-fg shadow-sm"
                        : "text-fg-soft hover:bg-surface/70"
                    )}
                  >
                    <Icon
                      size={19}
                      className={cx(
                        "shrink-0 transition-colors",
                        active ? "text-fg" : "text-muted group-hover:text-fg-soft"
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={cx(
                          "tnum grid h-6 min-w-[24px] place-items-center rounded-full px-1.5 text-[11px] font-semibold",
                          item.badgeTone === "red"
                            ? "bg-red-500 text-white"
                            : item.badgeTone === "amber"
                            ? "bg-amber-400 text-[#1c1c1c]"
                            : "bg-inverse text-inverse-fg"
                        )}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-line bg-gradient-to-b from-[#f2f3f5] to-[#fbfbfc]">
      {/* The drawn AG, not the roundel — that one is reserved for the way in. */}
      <div className="flex shrink-0 flex-col items-center gap-2 px-5 pb-5 pt-7">
        <Monogram size="md" />
        <p className="font-serif text-[15px] font-semibold tracking-[0.14em] text-fg">
          ABER GROUP
        </p>
      </div>

      {nav}

      <div className="shrink-0 p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-xs">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-subtle text-[12px] font-semibold text-fg-soft">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-fg">{user.name}</p>
            <p className="truncate text-[11px] text-muted">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-1.5 text-muted transition hover:bg-subtle hover:text-fg"
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 shadow-lg">{sidebar}</div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-md lg:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 rounded-lg p-2 text-muted transition hover:bg-subtle hover:text-fg lg:hidden"
          >
            <Menu size={18} />
          </button>

          <Breadcrumbs pathname={pathname} />

          <div className="ml-auto flex items-center gap-2">
            <CommandPalette
              pages={groups.flatMap((g) =>
                g.items.map((i) => ({ href: i.href, label: i.label, group: g.title }))
              )}
            />


            <Link
              href="/alerts"
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:border-line-strong hover:text-fg"
              title="Alerts"
            >
              <BellRing size={16} />
              {alertCount > 0 && (
                <span className="pulse-ring tnum absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {alertCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="fade-up mx-auto w-full max-w-[1400px]">{children}</div>
        </main>

        <footer className="border-t border-line px-4 py-4 text-[11px] text-faint lg:px-8">
          Aber Group Property Management — internal system. Every action on this system is recorded
          in the audit log.
        </footer>
      </div>
    </div>
  );
}

const CRUMB_LABELS: Record<string, string> = {
  "": "Dashboard",
  tasks: "My Tasks",
  time: "Time in App",
  properties: "Properties",
  units: "Units",
  tenants: "Tenants",
  contracts: "Contracts",
  renewals: "Renewals",
  cheques: "Cheques",
  payments: "Payments",
  maintenance: "Maintenance",
  approvals: "Approvals",
  reports: "Reports",
  audit: "Audit Log",
  admin: "Administration",
  users: "Users & Roles",
  new: "New",
  alerts: "Alerts",
  deposit: "Deposit",
  bounce: "Return",
  renew: "Renewal",
};

function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <Link href="/dashboard" className="shrink-0 text-muted transition hover:text-fg">
        Home
      </Link>
      {parts.map((p, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight size={13} className="shrink-0 text-faint" />
          <span
            className={cx(
              "truncate",
              i === parts.length - 1 ? "font-medium text-fg" : "text-muted"
            )}
          >
            {CRUMB_LABELS[p] ?? (p.length > 12 ? p.slice(0, 10) + "…" : p)}
          </span>
        </span>
      ))}
    </nav>
  );
}
