import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import { currentUser, startSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rbac";
import { findUserById, listDemoUsers } from "@/lib/repos/accounts";
import { userStatus } from "@/lib/types";
import { AuthFooterLink, AuthHeading, AuthShell } from "@/components/AuthShell";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in — Aber Group" };

/**
 * One-click sign-in for the seeded demo accounts, which carry no password. Real
 * accounts — anything created through signup — go through `signInAction`.
 */
async function useDemoAccount(formData: FormData) {
  "use server";
  const id = String(formData.get("userId") ?? "");
  const user = await findUserById(id);
  if (!user || !user.active || user.passwordHash) redirect("/login");
  await startSession(user.id);
  redirect("/dashboard");
}

const GUARANTEES = [
  "No contract goes live without manager approval",
  "No cheque due date passes without a reminder and a task",
  "No action happens without an audit trail",
];

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");

  // Only the seeded accounts belong in the quick-access list; accounts created
  // through signup must use their own password.
  const demoUsers = (await listDemoUsers()).filter(
    (u) => u.active && !u.passwordHash && userStatus(u) === "active"
  );

  return (
    <AuthShell
      aside={
        <ul className="space-y-4">
          {GUARANTEES.map((t) => (
            <li key={t} className="flex items-start gap-3 text-[13.5px] text-inverse-muted">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-inverse-fg opacity-60" />
              {t}
            </li>
          ))}
        </ul>
      }
    >
      <AuthHeading
        eyebrow="Property management"
        title="Sign in"
        sub="Your role decides exactly what you can see and do once you are in."
      />

      <SignInForm />

      {demoUsers.length > 0 && (
        <details className="group mt-8 border-t border-line-soft pt-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-medium text-fg-soft transition hover:text-fg">
            Continue with a demo account
            <ChevronDown
              size={16}
              className="shrink-0 text-faint transition group-open:rotate-180"
            />
          </summary>

          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            Pre-seeded staff accounts, one per role, for walking through the system. They have no
            password.
          </p>

          <form action={useDemoAccount} className="mt-4 space-y-1.5">
            {demoUsers.map((u) => (
              <button
                key={u.id}
                name="userId"
                value={u.id}
                type="submit"
                className="group/row flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition hover:border-line hover:bg-surface"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-subtle text-[11.5px] font-semibold text-fg-soft">
                  {u.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-fg">{u.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {u.title} · {ROLE_LABEL[u.role]}
                  </span>
                </span>
                <ArrowRight
                  size={15}
                  className="shrink-0 text-faint transition group-hover/row:translate-x-0.5 group-hover/row:text-fg"
                />
              </button>
            ))}
          </form>
        </details>
      )}

      <AuthFooterLink question="No account yet?" href="/signup" action="Request access" />
    </AuthShell>
  );
}
