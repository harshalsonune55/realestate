import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rbac";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ perm?: string }>;
}) {
  const user = await requireUser();
  const { perm } = await searchParams;

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card className="text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-subtle text-muted">
          <ShieldOff size={24} />
        </div>
        <h1 className="text-xl font-semibold text-fg">You do not have access to this screen</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Your role is <b className="text-fg">{ROLE_LABEL[user.role]}</b>, which does not
          include{" "}
          <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] text-fg">
            {perm ?? "this capability"}
          </code>
          . This is not a mistake — permissions are set by role so each employee sees only what
          their job needs.
        </p>
        <p className="mt-3 text-[12.5px] text-faint">
          If you need this access, ask the systems administrator to change your role.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-solid px-5 text-sm font-medium text-white transition hover:bg-brand-solid-hover"
        >
          Back to the dashboard
        </Link>
      </Card>
    </div>
  );
}
