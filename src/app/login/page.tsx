import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldCheck, Lock, ArrowRight } from "lucide-react";
import { db } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rbac";
import { cx } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";
  const id = String(formData.get("userId") ?? "");
  const user = db().users.find((u) => u.id === id && u.active);
  if (!user) redirect("/login?error=1");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, user.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
  redirect("/");
}

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-ink-800",
  manager: "bg-brand-700",
  accountant: "bg-sky-700",
  leasing: "bg-gold-500",
  maintenance: "bg-slate-600",
  viewer: "bg-slate-500",
};

export default async function LoginPage() {
  const users = db().users.filter((u) => u.active);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* left: brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #0f766e, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-white">AL MANARA</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Property Management
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Every process, guided step by step.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-300">
            450 units. 1,800 cheques a year. This system walks each employee through every
            procedure in order, blocks the step until it is done correctly, and records who did
            what and when.
          </p>
          <ul className="mt-8 space-y-3 text-[14px] text-slate-300">
            {[
              "No contract goes live without manager approval",
              "No cheque due date passes without a reminder and a task",
              "No action happens without an audit trail",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <ShieldCheck size={17} className="mt-0.5 shrink-0 text-brand-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-500">
          Internal use only · Not accessible outside the company network
        </p>
      </div>

      {/* right: sign in */}
      <div className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
              AM
            </div>
            <p className="text-sm font-semibold">AL MANARA Property Management</p>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-ink-900">
            Sign in to continue
          </h2>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Choose your staff account. Your role decides exactly what you can see and do.
          </p>

          <form action={signIn} className="mt-6 space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                name="userId"
                value={u.id}
                type="submit"
                className="group flex w-full items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition hover:border-brand-400 hover:shadow-md"
              >
                <div
                  className={cx(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white",
                    ROLE_COLOR[u.role]
                  )}
                >
                  {u.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink-900">{u.name}</p>
                  <p className="truncate text-[12px] text-slate-500">
                    {u.title} · {ROLE_LABEL[u.role]}
                  </p>
                </div>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
                />
              </button>
            ))}
          </form>

          <div className="mt-6 flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-[12px] text-slate-600">
            <Lock size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              <b>Prototype.</b> In production this screen is replaced with company email +
              password and a one-time code, and the site is reachable only from the office network
              or VPN.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
