import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import SignUpForm from "./SignUpForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Request access — Aber Group" };

const STEPS = [
  { n: "01", title: "Tell us who you are", detail: "Your name, work email and what you do." },
  { n: "02", title: "An administrator reviews it", detail: "They confirm the role you should hold." },
  { n: "03", title: "You sign in", detail: "Your role decides what you can see and change." },
];

export default async function SignUpPage() {
  // Someone already signed in has no business on this screen.
  if (await currentUser()) redirect("/");

  return (
    <AuthShell
      aside={
        <ol className="space-y-6">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="font-serif text-[13px] tracking-[0.2em] text-inverse-muted">
                {s.n}
              </span>
              <span className="border-l border-inverse-line pl-4">
                <span className="block text-[14px] font-medium text-inverse-fg">{s.title}</span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-inverse-muted">
                  {s.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
