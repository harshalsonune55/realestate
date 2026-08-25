"use client";

/**
 * Saved chats, in the browser.
 *
 * The transcripts live in `localStorage` rather than on the server: they are a
 * convenience for one person on one machine, and putting them in the database
 * would mean storing a copy of every answer the assistant ever gave about
 * tenants and staff, with its own retention question attached. Nothing here is
 * a system record — the audit log already holds what actually happened.
 *
 * The key is scoped by user id because the demo accounts all share a browser.
 * Without that, signing in as somebody else would show you their chats.
 */

export interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Names only — the bytes are sent once and never kept in the transcript. */
  files?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  turns: Turn[];
  /** Epoch ms, for ordering the list newest-first. */
  updatedAt: number;
}

/** Kept small on purpose: `localStorage` is a few MB for the whole origin. */
const MAX_CHATS = 40;

const keyFor = (userId: string) => `pms.assistant.chats.${userId}`;

export function newId(): string {
  // `crypto.randomUUID` is not available on every browser this runs in, and a
  // collision here would silently merge two conversations.
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The first thing the person asked, trimmed to fit the sidebar. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length === 0) return "New chat";
  return line.length > 42 ? line.slice(0, 42).trimEnd() + "…" : line;
}

export function load(userId: string): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Anything hand-edited or written by an older version is dropped rather
    // than trusted — a malformed turn would break the whole transcript.
    return parsed.filter(isConversation).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function save(userId: string, chats: Conversation[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = [...chats]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CHATS);
    window.localStorage.setItem(keyFor(userId), JSON.stringify(trimmed));
  } catch {
    // A full quota must not take the chat down: the conversation on screen
    // still works, it just will not survive a reload.
  }
}

function isConversation(v: unknown): v is Conversation {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Partial<Conversation>;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.updatedAt === "number" &&
    Array.isArray(c.turns) &&
    c.turns.every(
      (t) =>
        typeof t?.content === "string" &&
        (t.role === "user" || t.role === "assistant")
    )
  );
}

/** "Just now", "3h ago", "12 Aug" — the sidebar's timestamp. */
export function when(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
