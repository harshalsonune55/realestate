"use client";

import { useActionState, useId, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { signInAction, type SignInState } from "@/lib/actions/account";
import { cx } from "@/lib/utils";
import {
  AuthAlert,
  AuthField,
  AuthInput,
  AuthSubmit,
  authInputClass,
} from "@/components/AuthShell";

export default function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {});
  const [reveal, setReveal] = useState(false);
  const uid = useId();

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <AuthAlert>{state.error}</AuthAlert>}

      <AuthField label="Work email" htmlFor={`${uid}-email`}>
        <AuthInput
          id={`${uid}-email`}
          name="email"
          type="email"
          defaultValue={state.email}
          autoComplete="username"
          placeholder="you@abergroup.ae"
          invalid={!!state.error}
          required
        />
      </AuthField>

      <AuthField label="Password" htmlFor={`${uid}-password`}>
        <div className="relative">
          <input
            id={`${uid}-password`}
            name="password"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••"
            required
            className={cx(
              authInputClass,
              "pr-12",
              state.error ? "border-red-300" : "border-line focus:border-fg-soft"
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
      </AuthField>

      <AuthSubmit pending={pending}>
        {pending ? "Signing in" : "Sign in"}
        {!pending && <ArrowRight size={17} />}
      </AuthSubmit>
    </form>
  );
}
