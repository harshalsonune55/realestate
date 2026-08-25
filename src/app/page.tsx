import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, CalendarClock, Landmark, ShieldCheck } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { Wordmark } from "@/components/Brand";

/**
 * The public front door.
 *
 * Anyone already carrying a valid session goes straight through to the
 * dashboard — a person who is signed in has no use for a sales page, and
 * making them click past one every visit is friction with no purpose.
 *
 * The check is `currentUser()` rather than a look at the raw cookie, because
 * the cookie only carries an id: an account that has since been suspended or
 * deleted still has one in the browser, and that must land on the login screen
 * rather than bouncing into an app it can no longer use.
 */
export const dynamic = "force-dynamic";

const POINTS = [
  {
    icon: Building2,
    title: "The portfolio, in one place",
    body: "Every building, unit and tenancy, with occupancy that updates as contracts are approved.",
  },
  {
    icon: Landmark,
    title: "Cheques tracked to clearance",
    body: "Post-dated cheques, deposits, bounces and replacements — each with the task it raises.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals that cannot be skipped",
    body: "Anything touching money or a tenancy stops for a second pair of eyes before it goes live.",
  },
  {
    icon: CalendarClock,
    title: "Viewings through to signature",
    body: "Book a viewing, record the outcome, and follow it into a contract without re-keying it.",
  },
];

export default async function LandingPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <main className="min-h-dvh bg-canvas">
      {/* ------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden">
        <Image
          src="/brand/hero-tower.png"
          alt=""
          fill
          // The hero is the largest thing on the page and the first thing
          // painted, so it is fetched eagerly rather than lazily.
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Two light washes rather than one heavy one. Between them the
            photograph keeps its colour, and the legibility work is done by the
            text's own shadow instead of by drowning the image — which is why
            these can be this soft and the headline still holds its edge. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/50"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent"
        />

        <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-7">
          <header className="flex items-center justify-between gap-4">
            <Wordmark className="text-white" />
            <Link
              href="/login"
              className="rounded-full border border-white/30 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:border-white/60 hover:bg-white/10"
            >
              Sign in
            </Link>
          </header>

          <div className="flex flex-1 items-center py-16">
            <div className="max-w-2xl">
              <p
                className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-white/80"
                style={{ textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}
              >
                Aber Group · Abu Dhabi
              </p>
              {/* The shadow is the legibility mechanism, not decoration: the
                  headline crosses both a dark cloud and a lit one, so a flat
                  fill loses its edge somewhere along every line whatever the
                  scrim does. */}
              <h1
                className="mt-4 text-[40px] font-bold leading-[1.06] tracking-[-0.03em] text-white sm:text-[56px]"
                style={{ textShadow: "0 2px 24px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.45)" }}
              >
                Property management,
                <br />
                start to signature.
              </h1>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-[#101010] transition hover:bg-white/90"
                >
                  Sign in <ArrowRight size={16} />
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full border border-white/35 px-6 py-3 text-[14px] font-semibold text-white transition hover:border-white/70 hover:bg-white/10"
                >
                  Request an account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- the work */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-[24px] font-bold tracking-[-0.02em] text-fg">
          What it keeps track of
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-line bg-surface p-5 shadow-xs"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={18} />
              </span>
              <h3 className="mt-4 text-[15px] font-bold text-fg">{title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12.5px] text-muted">
          <span>© {new Date().getFullYear()} Aber Group. All rights reserved.</span>
          <Link href="/login" className="font-medium text-fg-soft hover:text-fg">
            Staff sign in →
          </Link>
        </div>
      </footer>
    </main>
  );
}
