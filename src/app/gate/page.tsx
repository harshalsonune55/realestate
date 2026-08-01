import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import { GATE_COOKIE, gateToken } from "@/lib/gate";

export const dynamic = "force-dynamic";

async function unlock(formData: FormData) {
  "use server";
  const secret = process.env.PMS_ACCESS_PASSWORD;
  const given = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!secret) redirect("/");
  if (given !== secret) {
    redirect("/gate?error=1" + (next !== "/" ? `&next=${encodeURIComponent(next)}` : ""));
  }

  const jar = await cookies();
  jar.set(GATE_COOKIE, await gateToken(secret), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(next.startsWith("/") ? next : "/");
}

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  if (!process.env.PMS_ACCESS_PASSWORD) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-inverse px-6">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-solid text-lg font-bold text-white">
            AM
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-white">AL MANARA</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Property Management
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <div className="mb-4 flex items-center gap-2 text-white">
            <Lock size={16} className="text-brand-400" />
            <h1 className="text-[15px] font-semibold">Private system</h1>
          </div>
          <p className="mb-5 text-[13px] leading-relaxed text-white/70">
            This system is for company staff only. Enter the access password to continue.
          </p>

          <form action={unlock} className="space-y-3">
            <input type="hidden" name="next" value={sp.next ?? "/"} />
            <div className="relative">
              <KeyRound
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                name="password"
                type="password"
                autoFocus
                required
                placeholder="Access password"
                className="w-full rounded-lg border border-white/15 bg-white/5 py-2.5 pl-9 pr-3 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25"
              />
            </div>

            {sp.error && (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
                That password is not correct.
              </p>
            )}

            <button
              type="submit"
              className="h-11 w-full rounded-lg bg-brand-solid text-sm font-medium text-white transition hover:bg-brand-solid-hover"
            >
              Continue
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/40">
          Access is logged. Unauthorised use is prohibited.
        </p>
      </div>
    </div>
  );
}
