"use client";

import { useActionState, useId, useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  FileSignature,
  ShieldCheck,
  Wallet,
  Wrench,
} from "lucide-react";
import { signUpAction, type SignUpState } from "@/lib/actions/account";
import { ROLE_SUMMARY, SIGNUP_ROLES } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { cx } from "@/lib/utils";
import {
  AuthAlert,
  AuthField,
  AuthFooterLink,
  AuthHeading,
  AuthInput,
  AuthSubmit,
  authInputClass,
} from "@/components/AuthShell";

const ROLE_ICON: Record<string, React.ReactNode> = {
  leasing: <FileSignature size={16} />,
  accountant: <Wallet size={16} />,
  maintenance: <Wrench size={16} />,
  manager: <ShieldCheck size={16} />,
  viewer: <Eye size={16} />,
};

const ROLE_TITLE: Record<string, string> = {
  leasing: "Leasing",
  accountant: "Accounts",
  maintenance: "Maintenance",
  manager: "Manager",
  viewer: "Read only",
};

/** Mirrors `passwordProblems` on the server so the two can never disagree. */
const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "10+ characters", test: (v) => v.length >= 10 },
  { label: "Lower-case", test: (v) => /[a-z]/.test(v) },
  { label: "Upper-case", test: (v) => /[A-Z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
];

const STRENGTH = [
  { label: "Too short", bar: "bg-red-300" },
  { label: "Weak", bar: "bg-red-300" },
  { label: "Fair", bar: "bg-amber-200" },
  { label: "Good", bar: "bg-brand-300" },
  { label: "Strong", bar: "bg-brand-500" },
] as const;

export default function SignUpForm() {
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(signUpAction, {});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const uid = useId();

  const met = RULES.map((r) => r.test(password));
  const score = met.filter(Boolean).length + (password.length >= 14 ? 1 : 0);
  const strength = STRENGTH[Math.min(score, 4)];
  const matches = confirm.length > 0 && confirm === password;

  const err = state.errors ?? {};
  const v = state.values;

  return (
    <>
      <AuthHeading
        eyebrow="Request access"
        title="Create your account"
        sub="Tell us who you are and what you do. An administrator reviews every request before the account is switched on."
      />

      <form action={formAction} className="space-y-5" noValidate>
        {err.form && <AuthAlert>{err.form}</AuthAlert>}

        <AuthField label="Full name" htmlFor={`${uid}-name`} error={err.name}>
          <AuthInput
            id={`${uid}-name`}
            name="name"
            defaultValue={v?.name}
            autoComplete="name"
            placeholder="Sara Khalifa"
            invalid={!!err.name}
            required
          />
        </AuthField>

        <AuthField
          label="Work email"
          htmlFor={`${uid}-email`}
          error={err.email}
          hint="This becomes your sign-in name."
        >
          <AuthInput
            id={`${uid}-email`}
            name="email"
            type="email"
            defaultValue={v?.email}
            autoComplete="email"
            placeholder="sara@abergroup.ae"
            invalid={!!err.email}
            required
          />
        </AuthField>

        <div className="grid gap-5 sm:grid-cols-2">
          <AuthField label="Job title" htmlFor={`${uid}-title`} error={err.title}>
            <AuthInput
              id={`${uid}-title`}
              name="title"
              defaultValue={v?.title}
              autoComplete="organization-title"
              placeholder="Leasing Executive"
              invalid={!!err.title}
              required
            />
          </AuthField>

          <AuthField label="Phone" htmlFor={`${uid}-phone`} error={err.phone} optional>
            <AuthInput
              id={`${uid}-phone`}
              name="phone"
              type="tel"
              defaultValue={v?.phone}
              autoComplete="tel"
              placeholder="+971 50 000 0000"
              invalid={!!err.phone}
            />
          </AuthField>
        </div>

        {/* role request — native radios so this still works with JS disabled */}
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-fg">Access you need</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {SIGNUP_ROLES.map((role: Role) => (
              <label
                key={role}
                className={cx(
                  "group relative flex cursor-pointer items-start gap-2.5 rounded-2xl border border-line bg-surface p-3.5 transition",
                  "hover:border-line-strong",
                  "has-[:checked]:border-fg has-[:checked]:bg-subtle",
                  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/15"
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  defaultChecked={v?.role === role}
                  className="sr-only"
                />
                <span className="mt-px text-muted transition group-has-[:checked]:text-fg">
                  {ROLE_ICON[role]}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-fg">{ROLE_TITLE[role]}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                    {ROLE_SUMMARY[role]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {err.role && <p className="mt-2 text-[12.5px] font-medium text-red-700">{err.role}</p>}
        </fieldset>

        <AuthField label="Password" htmlFor={`${uid}-password`} error={err.password}>
          <div className="relative">
            <input
              id={`${uid}-password`}
              name="password"
              type={reveal ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 10 characters"
              aria-invalid={!!err.password || undefined}
              required
              className={cx(
                authInputClass,
                "pr-12",
                err.password ? "border-red-300" : "border-line focus:border-fg-soft"
              )}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center rounded-xl text-faint transition hover:bg-subtle hover:text-fg"
            >
              {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {password.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <div className="flex h-1 flex-1 gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cx(
                        "h-full flex-1 rounded-full transition-colors duration-300",
                        i < Math.min(score, 4) ? strength.bar : "bg-line"
                      )}
                    />
                  ))}
                </div>
                <span className="w-14 text-right text-[11.5px] font-medium text-muted">
                  {strength.label}
                </span>
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {RULES.map((r, i) => (
                  <li
                    key={r.label}
                    className={cx(
                      "flex items-center gap-1.5 text-[11.5px] transition-colors",
                      met[i] ? "text-brand-600" : "text-faint"
                    )}
                  >
                    <span
                      className={cx(
                        "grid h-3.5 w-3.5 place-items-center rounded-full transition-colors",
                        met[i] ? "bg-brand-500 text-white" : "bg-subtle"
                      )}
                    >
                      {met[i] && <Check size={9} strokeWidth={3.5} />}
                    </span>
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AuthField>

        <AuthField label="Confirm password" htmlFor={`${uid}-confirm`} error={err.confirm}>
          <div className="relative">
            <input
              id={`${uid}-confirm`}
              name="confirm"
              type={reveal ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="Type it again"
              aria-invalid={!!err.confirm || undefined}
              required
              className={cx(
                authInputClass,
                "pr-12",
                err.confirm
                  ? "border-red-300"
                  : matches
                  ? "border-brand-400"
                  : "border-line focus:border-fg-soft"
              )}
            />
            {matches && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-600">
                <Check size={18} strokeWidth={2.5} />
              </span>
            )}
          </div>
        </AuthField>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-subtle p-4">
          <input
            type="checkbox"
            name="terms"
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
          />
          <span className="text-[12.5px] leading-relaxed text-fg-soft">
            I am an employee or authorised contractor of Aber Group, and I understand every action I
            take in this system is recorded against my name.
          </span>
        </label>
        {err.terms && <p className="-mt-2 text-[12.5px] font-medium text-red-700">{err.terms}</p>}

        <AuthSubmit pending={pending}>
          {pending ? "Sending request" : "Request access"}
          {!pending && <ArrowRight size={17} />}
        </AuthSubmit>
      </form>

      <AuthFooterLink question="Already have an account?" href="/login" action="Sign in" />
    </>
  );
}
