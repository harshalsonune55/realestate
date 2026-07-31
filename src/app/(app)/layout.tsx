import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { alerts, chequeFlag } from "@/lib/queries";
import Shell, { NavGroup, NavItem } from "@/components/Shell";

/** Keeps literal types intact while allowing `false` for permission-gated entries. */
const item = (i: NavItem) => i;
const only = (allowed: boolean, i: NavItem) => (allowed ? i : null);

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const d = db();

  const myTasks = d.tasks.filter((t) => t.assignedTo === user.id && t.status !== "done");
  const myOverdue = myTasks.filter((t) => t.status === "overdue").length;
  const pendingApprovals = d.approvals.filter((a) => a.status === "pending").length;
  const chequeTrouble = d.cheques.filter(
    (c) => chequeFlag(c) === "overdue" || c.status === "bounced"
  ).length;
  const openMaint = d.maintenance.filter(
    (m) => !["closed", "completed", "rejected"].includes(m.status)
  ).length;
  const expiring = d.contracts.filter((c) => c.status === "expiring").length;

  const clean = (title: string, items: (NavItem | null)[]): NavGroup => ({
    title,
    items: items.filter((i): i is NavItem => i !== null),
  });

  const groups: NavGroup[] = [
    clean("Overview", [
      item({ href: "/", label: "Dashboard", icon: "LayoutDashboard" }),
      item({
        href: "/tasks",
        label: "My Tasks",
        icon: "ListChecks",
        badge: myTasks.length,
        badgeTone: myOverdue ? "red" : "slate",
      }),
    ]),
    clean("Leasing", [
      only(can(user.role, "properties.view"), { href: "/properties", label: "Properties", icon: "Building2" }),
      only(can(user.role, "properties.view"), { href: "/units", label: "Units", icon: "DoorOpen" }),
      only(can(user.role, "tenants.view"), { href: "/tenants", label: "Tenants", icon: "Users" }),
      only(can(user.role, "contracts.view"), { href: "/contracts", label: "Contracts", icon: "FileSignature" }),
      only(can(user.role, "renewals.view"), {
        href: "/renewals",
        label: "Renewals",
        icon: "RefreshCw",
        badge: expiring,
        badgeTone: "amber",
      }),
    ]),
    clean("Finance", [
      only(can(user.role, "cheques.view"), {
        href: "/cheques",
        label: "Cheques",
        icon: "Landmark",
        badge: chequeTrouble,
        badgeTone: "red",
      }),
      only(can(user.role, "payments.view"), { href: "/payments", label: "Payments", icon: "Receipt" }),
    ]),
    clean("Operations", [
      only(can(user.role, "maintenance.view"), {
        href: "/maintenance",
        label: "Maintenance",
        icon: "Wrench",
        badge: openMaint,
        badgeTone: "slate",
      }),
      only(can(user.role, "approvals.view"), {
        href: "/approvals",
        label: "Approvals",
        icon: "ShieldCheck",
        badge: pendingApprovals,
        badgeTone: can(user.role, "approvals.decide") ? "amber" : "slate",
      }),
    ]),
    clean("Insight", [
      only(can(user.role, "reports.view"), { href: "/reports", label: "Reports", icon: "BarChart3" }),
      only(can(user.role, "audit.view"), { href: "/audit", label: "Audit Log", icon: "ScrollText" }),
    ]),
    clean("Administration", [
      only(can(user.role, "admin.users"), { href: "/admin/users", label: "Users & Roles", icon: "UserCog" }),
    ]),
  ].filter((g) => g.items.length > 0);

  const alertCount = alerts().filter((a) => a.severity !== "info").length;

  return (
    <Shell
      user={{ name: user.name, role: user.role, title: user.title }}
      groups={groups}
      alertCount={alertCount}
    >
      {children}
    </Shell>
  );
}
