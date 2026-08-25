import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Clock, Mail } from "lucide-react";
import { AuthHeading, AuthShell } from "@/components/AuthShell";
import { primaryAdmin } from "@/lib/repos/accounts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Request received — Aber Group" };

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const admin = await primaryAdmin();

  return (
    <AuthShell>
      <div className="mb-8 grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Check size={26} strokeWidth={2.5} />
      </div>

      <AuthHeading
        title="Request received"
        sub={
          <>
            Your account is created but switched off until an administrator approves it. Nothing in
            the system is visible to you until then.
          </>
        }
      />

      <dl className="rounded-2xl border border-line bg-surface">
        <div className="flex items-start gap-3.5 border-b border-line-soft p-4">
          <Mail size={17} className="mt-0.5 shrink-0 text-faint" />
          <div className="min-w-0">
            <dt className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
              Sign-in name
            </dt>
            <dd className="mt-1 truncate text-[14px] font-medium text-fg">
              {email ?? "your work email"}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-3.5 p-4">
          <Clock size={17} className="mt-0.5 shrink-0 text-faint" />
          <div className="min-w-0">
            <dt className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
              With
            </dt>
            <dd className="mt-1 text-[14px] font-medium text-fg">
              {admin ? admin.name : "The system administrator"}
            </dd>
            <dd className="mt-1 text-[12.5px] leading-relaxed text-muted">
              A task has been raised for them. They decide the role your account is given.
            </dd>
          </div>
        </div>
      </dl>

      <Link
        href="/login"
        className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-inverse text-[15px] font-medium text-inverse-fg transition hover:bg-inverse-2"
      >
        Back to sign in
        <ArrowRight size={17} />
      </Link>
    </AuthShell>
  );
}
