"use client";

import { useState } from "react";
import { Check, Clock, Mail, Phone, X } from "lucide-react";
import { approveSignupAction, declineSignupAction } from "@/lib/actions/account";
import { ROLE_LABEL, SIGNUP_ROLES } from "@/lib/rbac";
import type { Role, User } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";
import { Button } from "@/components/ui";
import { Select } from "@/components/form";

/**
 * One access request. The role is a field rather than a straight yes/no: people
 * ask for what they think they need, and the administrator is the one who
 * decides what they actually get.
 */
function Request({ user }: { user: User }) {
  const [role, setRole] = useState<Role>(user.requestedRole ?? "viewer");
  const [declining, setDeclining] = useState(false);

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-[12px] font-semibold text-fg-soft">
            {user.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-fg">{user.name}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">{user.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={12.5} className="text-faint" />
                {user.email}
              </span>
              {user.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={12.5} className="text-faint" />
                  {user.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Clock size={12.5} className="text-faint" />
                {fmtDateTime(user.createdAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[190px]">
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-label={`Role for ${user.name}`}
            >
              {SIGNUP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                  {r === user.requestedRole ? " (asked for)" : ""}
                </option>
              ))}
            </Select>
          </div>

          <form action={approveSignupAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="role" value={role} />
            <Button type="submit" size="sm">
              <Check size={14} /> Approve
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDeclining((d) => !d)}
          >
            <X size={14} /> Decline
          </Button>
        </div>
      </div>

      {declining && (
        <form action={declineSignupAction} className="mt-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <input
            name="reason"
            placeholder="Reason (recorded in the audit log)"
            className="h-9 min-w-[240px] flex-1 rounded-xl border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-faint focus:border-red-300 focus:outline-none"
          />
          <Button type="submit" variant="danger" size="sm">
            Decline request
          </Button>
        </form>
      )}
    </li>
  );
}

export default function PendingRequests({ users }: { users: User[] }) {
  return (
    <ul className="divide-y divide-line-soft">
      {users.map((u) => (
        <Request key={u.id} user={u} />
      ))}
    </ul>
  );
}
