"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ListChecks, Building2, DoorOpen, Users, FileSignature,
  RefreshCw, Landmark, Receipt, Wrench, ShieldCheck, BarChart3, ScrollText,
  UserCog, LogOut, Menu, X, Search, BellRing, ChevronRight,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/rbac";
import type { Role } from "@/lib/types";

const ICONS = {
  LayoutDashboard, ListChecks, Building2, DoorOpen, Users, FileSignature,
  RefreshCw, Landmark, Receipt, Wrench, ShieldCheck, BarChart3, ScrollText, UserCog,
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

  const nav = (
    <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-4">
      {groups.map((g) => (
        <div key={g.title} className="mb-5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {g.title}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition",
                      active
                        ? "bg-brand-600/15 text-white font-medium ring-1 ring-inset ring-brand-400/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon
                      size={16}
                      className={cx(active ? "text-brand-400" : "text-slate-400 group-hover:text-slate-200")}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={cx(
                          "tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          item.badgeTone === "red"
                            ? "bg-red-500 text-white"
                            : item.badgeTone === "amber"
                            ? "bg-amber-400 text-ink-900"
                            : "bg-white/10 text-slate-200"
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
    <div className="flex h-full w-64 flex-col bg-ink-900">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white font-bold">
          AM
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">AL MANARA</p>
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-slate-400">
            Property Management
          </p>
        </div>
      </div>
      {nav}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              title="Sign out"
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
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
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
          <button
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={18} />
          </button>

          <Breadcrumbs pathname={pathname} />

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-slate-400 md:flex">
              <Search size={14} />
              <span>Search unit, tenant, cheque…</span>
              <kbd className="ml-2 rounded border border-line bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
                ⌘K
              </kbd>
            </div>
            <Link
              href="/alerts"
              className="relative rounded-lg border border-line bg-white p-2 text-slate-500 transition hover:text-ink-900"
              title="Alerts"
            >
              <BellRing size={16} />
              {alertCount > 0 && (
                <span className="pulse-ring absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {alertCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px] fade-up">{children}</div>
        </main>

        <footer className="border-t border-line px-4 py-4 text-[11px] text-slate-400 lg:px-8">
          Al Manara Property Management — internal system. Every action on this system is recorded
          in the audit log.
        </footer>
      </div>
    </div>
  );
}

const CRUMB_LABELS: Record<string, string> = {
  "": "Dashboard",
  tasks: "My Tasks",
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
    <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <Link href="/" className="shrink-0 text-slate-500 hover:text-ink-900">
        Home
      </Link>
      {parts.map((p, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight size={13} className="shrink-0 text-slate-300" />
          <span
            className={cx(
              "truncate",
              i === parts.length - 1 ? "font-medium text-ink-900" : "text-slate-500"
            )}
          >
            {CRUMB_LABELS[p] ?? (p.length > 12 ? p.slice(0, 10) + "…" : p)}
          </span>
        </span>
      ))}
    </div>
  );
}
