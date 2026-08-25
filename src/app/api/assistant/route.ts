import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { findUserById } from "@/lib/repos/accounts";
import { can } from "@/lib/rbac";
import { briefing, compactBriefing, type ChatTurn } from "@/lib/assistant";
import { loadData } from "@/lib/data";
import { retrievedBlock } from "@/lib/rag";
import { activeProvider, configurationHint } from "@/lib/llm";
import { prepare, type Attachment } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** Caps the history forwarded upstream so a long thread cannot balloon a request. */
const MAX_TURNS = 20;
/** Caps attachments per message, so one request cannot carry a whole folder. */
const MAX_FILES = 5;

/**
 * Assistant proxy.
 *
 * The key stays on the server — unlike the mobile build, the browser never
 * sees it, which is the arrangement the phone app should eventually adopt too.
 * The briefing is assembled here as well, so a caller cannot widen their own
 * context by editing the request.
 */
/**
 * Removes a reasoning model's private thinking from the answer.
 *
 * Some models (Qwen among them) narrate their reasoning in `<think>` tags
 * before answering. That is working-out, not the reply, and showing it reads
 * as the assistant talking to itself. An unclosed tag means the reply was cut
 * off mid-thought, so everything from the tag on is dropped.
 */
function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

/**
 * The employee a token-authenticated caller is acting for.
 *
 * The shared token proves the request came from our own app, not which person
 * is holding the phone — so the id is resolved against the repository and the
 * account's live role decides what the briefing contains. A token holder can
 * name any id, which is the same trust model the booking endpoint already
 * runs on; it is fine for an internal build and wants replacing with a real
 * per-user token before this is exposed publicly.
 */
async function bearerUser(req: Request) {
  const token = process.env.PMS_API_TOKEN;
  if (!token) return null;
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${token}`) return null;

  const id = req.headers.get("x-pms-user") ?? "";
  if (!id) return null;
  const user = await findUserById(id);
  return user?.active ? user : null;
}

/** The provider's own error code, when the fault body carried one. */
function errorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } };
    return parsed.error?.code ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  /* Two ways in. The browser carries a session cookie; the phone carries the
     shared bearer token and names the employee it is acting for, exactly as
     the booking endpoint does. Routing the app through here rather than
     letting it build its own prompt is the point: the briefing is assembled
     from the real repository, so the phone sees the same data the web does
     instead of the demo store generated on the device. */
  const user = (await currentUser()) ?? (await bearerUser(req));
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Checked here too, not only on the page: the route is a URL of its own, and
  // a hidden nav link is not an access control.
  if (!can(user.role, "assistant.use")) {
    return NextResponse.json({ error: "Not available for your role." }, { status: 403 });
  }

  const provider = activeProvider();
  if (!provider) {
    return NextResponse.json({ error: configurationHint() }, { status: 503 });
  }

  let turns: ChatTurn[];
  let files: Attachment[] = [];
  try {
    const body = (await req.json()) as {
      messages?: ChatTurn[];
      attachments?: Attachment[];
    };
    turns = (body.messages ?? [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-MAX_TURNS);
    files = (body.attachments ?? []).filter(
      (f) => f && typeof f.dataUrl === "string" && typeof f.type === "string"
    ).slice(0, MAX_FILES);
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
  // One snapshot for both the briefing and retrieval, from the configured
  // repository — the assistant must never answer from data the rest of the app
  // has moved past.
  const data = await loadData();
  const attached = await prepare(files);
  const hasImages = attached.images.length > 0;

  /* An image is most of the prompt already. Pairing it with the full briefing
     spends the vision model's whole per-minute token budget on context the
     picture does not need, and the request is refused before it is read. */
  const system = hasImages
    ? compactBriefing(data, user) + attached.documentBlock
    : briefing(data, user) +
      retrievedBlock(data, user, recentQuestions) +
      attached.documentBlock;

  /* An image needs a model that can see. The everyday model is text-only and
     rejects an image part outright, so the turn moves to the vision model for
     this request only — and if the provider has none, that is said plainly
     rather than sending a request that will certainly fail. */
  const needsVision = hasImages;
  if (needsVision && !provider.visionModel) {
    return NextResponse.json(
      { error: `${provider.label} has no model configured that can read images.` },
      { status: 503 }
    );
  }
  const model = needsVision ? provider.visionModel! : provider.model;

  // The images ride on the newest user turn, which is the one they were
  // attached to; earlier turns stay plain text.
  const wire = turns.map((t, i) =>
    needsVision && i === turns.length - 1 && t.role === "user"
      ? {
          role: t.role,
          content: [
            { type: "text", text: t.content },
            ...attached.images.map((img) => ({
              type: "image_url",
              image_url: { url: img.dataUrl },
            })),
          ],
        }
      : { role: t.role, content: t.content }
  );

  let res: Response;
  try {
    res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: "system", content: system }, ...wire],
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
    console.error(
      `assistant upstream error (${provider.name}/${model})`,
      res.status,
      detail.slice(0, 500)
    );
    /* Providers overload 429: it means "slow down" *and* "your account is out
       of credit", which need opposite responses from whoever reads this. The
       body carries the distinguishing code, so read it rather than telling
       somebody to retry a request that will never succeed. */
    const code = errorCode(detail);
    const message =
      res.status === 401 || res.status === 403
        ? `The assistant's ${provider.label} API key was rejected.`
        : res.status === 404 || res.status === 400
        ? `${provider.label} did not recognise the model "${model}". Set ${provider.name === "openai" ? "OPENAI_MODEL" : "GROQ_MODEL"} to one your account can use.`
        : code === "insufficient_quota"
        ? `The ${provider.label} account has no remaining credit. Add billing at platform.openai.com, or unset OPENAI_API_KEY to fall back to Groq.`
        : res.status === 429
        ? "The assistant is rate limited. Try again shortly."
        : "The assistant service returned an error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = stripReasoning(json.choices?.[0]?.message?.content ?? "");
  if (!reply) {
    return NextResponse.json(
      { error: "The assistant returned an empty reply." },
      { status: 502 }
    );
  }

  // The browser shows which service answered, so a wrong-model or
  // wrong-account answer is visible rather than silently attributed.
  return NextResponse.json({
    reply,
    model,
    provider: provider.label,
    // Files that could not be used are reported, never quietly dropped.
    problems: attached.problems.length > 0 ? attached.problems : undefined,
  });
}
