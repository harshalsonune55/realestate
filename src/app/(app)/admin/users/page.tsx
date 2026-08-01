import { Fragment } from "react";
import { Check, Minus, ShieldCheck, UserCog } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { ROLE_LABEL, ROLE_PERMS, can } from "@/lib/rbac";
import { db } from "@/lib/store";
import { cx, titleCase } from "@/lib/utils";
import { Badge, Card, PageHead, Table, TD, TH } from "@/components/ui";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "manager", "accountant", "leasing", "maintenance", "viewer"];

const PERM_GROUPS: { title: string; perms: { key: Parameters<typeof can>[1]; label: string }[] }[] = [
  {
    title: "Leasing",
    perms: [
      { key: "contracts.view", label: "View contracts" },
      { key: "contracts.create", label: "Prepare new contracts" },
      { key: "renewals.process", label: "Process renewals" },
      { key: "tenants.edit", label: "Edit tenant records" },
    ],
  },
  {
    title: "Finance",
    perms: [
      { key: "cheques.view", label: "View cheques" },
      { key: "cheques.deposit", label: "Deposit cheques" },
      { key: "cheques.bounce", label: "Record bank returns" },
      { key: "payments.view", label: "View payments" },
    ],
  },
  {
    title: "Operations",
    perms: [
      { key: "maintenance.view", label: "View maintenance" },
      { key: "maintenance.manage", label: "Raise and progress work orders" },
      { key: "approvals.view", label: "View approvals" },
      { key: "approvals.decide", label: "Approve or reject" },
    ],
  },
  {
    title: "Oversight",
    perms: [
      { key: "reports.view", label: "View reports" },
      { key: "audit.view", label: "View audit log" },
      { key: "admin.users", label: "Manage users and roles" },
    ],
  },
];

export default async function UsersPage() {
  await requirePerm("admin.users");
  const d = db();

  return (
    <div>
      <PageHead
        title="Users & roles"
        sub="Each employee sees only what their job needs. Permissions are attached to the role, not to the person, so a change applies everywhere at once."
      />

      <Card className="mb-5" padded={false}>
        <div className="border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
            <UserCog size={17} className="text-brand-600" /> Employees
          </h2>
        </div>
        <div className="px-5 pb-4 pt-2">
          <Table>
            <thead>
              <tr>
                <TH>Name</TH>
                <TH>Title</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH align="center">Open tasks</TH>
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {d.users.map((u) => (
                <tr key={u.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-[10.5px] font-semibold text-fg-soft">
                        {u.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                      </span>
                      <span className="font-medium text-fg">{u.name}</span>
                    </div>
                  </TD>
                  <TD className="text-fg-soft">{u.title}</TD>
                  <TD className="text-[12px] text-muted">{u.email}</TD>
                  <TD>
                    <Badge tone={u.role === "admin" ? "gold" : u.role === "manager" ? "good" : "info"}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </TD>
                  <TD align="center" className="tnum">
                    {d.tasks.filter((t) => t.assignedTo === u.id && t.status !== "done").length}
                  </TD>
                  <TD>
                    <Badge tone={u.active ? "good" : "neutral"} dot>
                      {u.active ? "Active" : "Disabled"}
                    </Badge>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card padded={false}>
        <div className="border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
            <ShieldCheck size={17} className="text-brand-600" /> Permission matrix
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            What each role can do. A blank cell means the screen and the action are both hidden.
          </p>
        </div>
        <div className="overflow-x-auto scroll-thin px-5 pb-5 pt-3">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr>
                <th className="border-b border-line pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Capability
                </th>
                {ROLES.map((r) => (
                  <th
                    key={r}
                    className="border-b border-line pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {titleCase(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERM_GROUPS.map((g) => (
                <Fragment key={g.title}>
                  <tr>
                    <td
                      colSpan={ROLES.length + 1}
                      className="bg-subtle px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"
                    >
                      {g.title}
                    </td>
                  </tr>
                  {g.perms.map((p) => (
                    <tr key={p.key}>
                      <td className="border-b border-line-soft py-2 pr-4 text-fg-soft">{p.label}</td>
                      {ROLES.map((r) => {
                        const allowed = ROLE_PERMS[r].includes(p.key);
                        return (
                          <td key={r} className="border-b border-line-soft py-2 text-center">
                            {allowed ? (
                              <Check size={15} className="mx-auto text-brand-600" />
                            ) : (
                              <Minus size={15} className="mx-auto text-faint" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r}>
            <p className="text-[13.5px] font-semibold text-fg">{ROLE_LABEL[r]}</p>
            <p className="mt-1 text-[12px] text-muted">
              {
                {
                  admin: "Full access including user management. Reserved for the systems administrator.",
                  manager: "Sees everything and is the only role that can approve or reject.",
                  accountant: "Cheques, payments and reports. Cannot create or change contracts.",
                  leasing: "Contracts, tenants and renewals. Cannot touch the banking side.",
                  maintenance: "Work orders only. No access to money or contracts.",
                  viewer: "Read-only across the system. Used for auditors and the owner.",
                }[r]
              }
            </p>
            <p
              className={cx(
                "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                r === "manager" ? "bg-brand-50 text-brand-700" : "bg-subtle text-fg-soft"
              )}
            >
              {ROLE_PERMS[r].length} capabilities
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
