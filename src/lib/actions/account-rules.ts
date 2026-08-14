// Pure signup validation, kept out of the server action so it can be tested
// directly and so the rules live in one place rather than being restated by the
// client form. No imports from the store, no request context.

import { passwordProblems } from "@/lib/password";
import { SIGNUP_ROLES } from "@/lib/rbac";
import type { Role } from "@/lib/types";

/**
 * Highest `U<n>` id already in use.
 *
 * The demo portfolio ships U1–U9 with no matching counter, so a signup that
 * trusted the counter's default would be handed an id an existing employee
 * already holds — and with it, that employee's session. The counter is seeded
 * from this instead.
 */
export function highestUserNumber(ids: string[]): number {
  return ids.reduce((max, id) => {
    const n = Number(/^U(\d+)$/.exec(id)?.[1] ?? 0);
    return n > max ? n : max;
  }, 0);
}

export type SignUpDraft = {
  name: string;
  email: string;
  phone: string;
  title: string;
  role: string;
  password: string;
  confirm: string;
  terms: boolean;
};

export type SignUpErrors = Partial<Record<keyof SignUpDraft | "form", string>>;

// Deliberately loose: the only thing worth rejecting is an address that cannot
// possibly be delivered to. Anything stricter turns into false refusals.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

/**
 * Blocking problems with a signup, keyed by field. Empty when acceptable.
 *
 * `takenEmails` is passed in rather than read from the store so this stays a
 * pure function; the caller supplies whatever it considers already registered.
 */
export function signUpProblems(d: SignUpDraft, takenEmails: string[] = []): SignUpErrors {
  const e: SignUpErrors = {};
  const email = d.email.trim().toLowerCase();

  if (d.name.trim().length < 3) e.name = "Enter your full name.";
  else if (!/\s/.test(d.name.trim())) e.name = "Enter your first and last name.";

  if (!email) e.email = "Enter your work email address.";
  else if (!EMAIL_RE.test(email)) e.email = "That does not look like an email address.";

  if (d.phone.trim() && !PHONE_RE.test(d.phone.trim()))
    e.phone = "Enter a reachable phone number.";

  if (d.title.trim().length < 2) e.title = "Enter your job title.";
  if (!SIGNUP_ROLES.includes(d.role as Role)) e.role = "Choose the role you need.";

  const problems = passwordProblems(d.password);
  const local = email.split("@")[0];
  if (problems.length) e.password = problems.join(" ");
  else if (local.length > 2 && d.password.toLowerCase().includes(local))
    e.password = "Do not put your email address in your password.";

  if (!d.confirm) e.confirm = "Type the password a second time.";
  else if (d.confirm !== d.password) e.confirm = "The two passwords do not match.";

  if (!d.terms) e.terms = "Confirm you are an employee of Aber Group before continuing.";

  // Checked last so a duplicate address is not reported alongside form typos.
  if (!e.email && takenEmails.some((t) => t.toLowerCase() === email))
    e.email = "An account already exists for this address. Sign in instead.";

  return e;
}
