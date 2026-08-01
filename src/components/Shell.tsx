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
import ThemeToggle from "./ThemeToggle";

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

  /* The sidebar sits on fixed dark chrome in both themes, so it uses the
     inverse-* tokens rather than the surface tokens the rest of the app uses. */
  const nav = (
    <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.title} className="mb-5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-inverse-muted">
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
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150",
                      active
                        ? "bg-white/[0.07] font-medium text-white"
                        : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                    )}
                  >
                    {/* accent rail marks the active route without shifting layout */}
                    <span
                      className={cx(
                        "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-400 transition-opacity",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Icon
                      size={16}
                      className={cx(
                        "shrink-0 transition-colors",
                        active ? "text-brand-400" : "text-white/40 group-hover:text-white/70"
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={cx(
                          "tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          item.badgeTone === "red"
                            ? "bg-red-500 text-white"
                            : item.badgeTone === "amber"
                            ? "bg-amber-400 text-[#0b1220]"
                            : "bg-white/10 text-white/70"
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
    <div className="flex h-full w-64 flex-col bg-inverse">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-inverse-line px-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-solid font-bold text-white shadow-sm">
          AM
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold tracking-wide text-white">AL MANARA</p>
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-inverse-muted">
            Property Management
          </p>
        </div>
      </div>

      {nav}

      <div className="shrink-0 border-t border-inverse-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-inverse-muted">{ROLE_LABEL[user.role]}</p>
          </div>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
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
            <div className="hidden items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-faint transition hover:border-line-strong md:flex">
              <Search size={14} />
              <span>Search unit, tenant, cheque…</span>
              <kbd className="ml-2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-faint">
                ⌘K
              </kbd>
            </div>

            <ThemeToggle />

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
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <Link href="/" className="shrink-0 text-muted transition hover:text-fg">
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
