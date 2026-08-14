import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { briefing, type ChatTurn } from "@/lib/assistant";
import { retrievedBlock } from "@/lib/rag";

export const dynamic = "force-dynamic";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/** Caps the history forwarded upstream so a long thread cannot balloon a request. */
const MAX_TURNS = 20;

/**
 * Assistant proxy.
 *
 * The key stays on the server — unlike the mobile build, the browser never
 * sees it, which is the arrangement the phone app should eventually adopt too.
 * The briefing is assembled here as well, so a caller cannot widen their own
 * context by editing the request.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "The assistant is not configured. Set GROQ_API_KEY in the server environment.",
      },
      { status: 503 }
    );
  }

  let turns: ChatTurn[];
  try {
    const body = (await req.json()) as { messages?: ChatTurn[] };
    turns = (body.messages ?? [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-MAX_TURNS);
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (turns.length === 0) {
    return NextResponse.json({ error: "Nothing to answer." }, { status: 400 });
  }

  /* Retrieval runs against the newest question plus the one before it, so a
     follow-up like "and when is it due?" still carries enough of the subject
     to hit the right record. */
  const recentQuestions = turns
    .filter((t) => t.role === "user")
    .slice(-2)
    .map((t) => t.content)
    .join(" ");
  const system = briefing(user) + retrievedBlock(user, recentQuestions);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          ...turns.map((t) => ({ role: t.role, content: t.content })),
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the assistant service." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    // The upstream body can carry the key back in an error echo, so it is
    // logged server-side and never forwarded to the browser verbatim.
    const detail = await res.text().catch(() => "");
    console.error("assistant upstream error", res.status, detail.slice(0, 500));
    const message =
      res.status === 401 || res.status === 403
        ? "The assistant's API key was rejected."
        : res.status === 404
        ? "The configured model was not found."
        : res.status === 429
        ? "The assistant is rate limited. Try again shortly."
        : "The assistant service returned an error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = json.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return NextResponse.json(
      { error: "The assistant returned an empty reply." },
      { status: 502 }
    );
  }

  return NextResponse.json({ reply });
}
