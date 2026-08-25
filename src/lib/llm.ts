import "server-only";

/**
 * Which model service the assistant talks to.
 *
 * Groq and OpenAI both serve OpenAI's `/chat/completions` schema, so the only
 * things that actually differ are the host, the key and the default model.
 * Keeping that difference in one table means the route stays provider-agnostic
 * and adding a third service later is a row here, not a branch in the handler.
 */

export type ProviderName = "openai" | "groq";

export interface Provider {
  name: ProviderName;
  label: string;
  endpoint: string;
  key: string;
  model: string;
  /** The model to use when the turn carries an image, if this provider has one. */
  visionModel: string | null;
}

interface Spec {
  label: string;
  endpoint: string;
  keyVar: string;
  modelVar: string;
  defaultModel: string;
  /** Null when nothing this provider offers can see an image. */
  defaultVisionModel: string | null;
  visionModelVar: string;
}

const SPECS: Record<ProviderName, Spec> = {
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    keyVar: "OPENAI_API_KEY",
    modelVar: "OPENAI_MODEL",
    // Overridable precisely because model names move faster than this file.
    defaultModel: "gpt-4o-mini",
    // Already multimodal, so the same model reads text and images.
    defaultVisionModel: "gpt-4o-mini",
    visionModelVar: "OPENAI_VISION_MODEL",
  },
  groq: {
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY",
    modelVar: "GROQ_MODEL",
    // The previous default, llama-3.3-70b-versatile, was decommissioned and
    // every request 404'd. Groq retires model ids on its own schedule, so when
    // this one goes the same way, list /v1/models and pick a current id rather
    // than assuming the key is at fault.
    defaultModel: "openai/gpt-oss-120b",
    // gpt-oss-120b is text-only — it rejects an image part outright — so an
    // image is handed to Qwen, the one model on this account that can see.
    defaultVisionModel: "qwen/qwen3.6-27b",
    visionModelVar: "GROQ_VISION_MODEL",
  },
};

/** Preference order when nothing is pinned: whichever key is actually present. */
const ORDER: ProviderName[] = ["openai", "groq"];

function isProviderName(v: string): v is ProviderName {
  return v === "openai" || v === "groq";
}

function build(name: ProviderName): Provider | null {
  const spec = SPECS[name];
  const key = process.env[spec.keyVar];
  if (!key) return null;
  return {
    name,
    label: spec.label,
    endpoint: spec.endpoint,
    key,
    model: process.env[spec.modelVar] || spec.defaultModel,
    visionModel: process.env[spec.visionModelVar] || spec.defaultVisionModel,
  };
}

/**
 * The provider to use, or `null` when none is configured.
 *
 * `ASSISTANT_PROVIDER` pins the choice explicitly. Without it the first
 * provider with a key present wins, so dropping `OPENAI_API_KEY` into the
 * environment is all it takes to move the assistant onto ChatGPT — and pulling
 * it back out falls through to Groq rather than breaking the feature.
 */
export function activeProvider(): Provider | null {
  const pinned = process.env.ASSISTANT_PROVIDER?.trim().toLowerCase();
  if (pinned) {
    // A pinned name that has no key is a misconfiguration worth failing on,
    // not something to paper over by quietly using the other service: the
    // operator asked for this one.
    return isProviderName(pinned) ? build(pinned) : null;
  }
  for (const name of ORDER) {
    const p = build(name);
    if (p) return p;
  }
  return null;
}

/** What to tell an operator whose assistant is not configured. */
export function configurationHint(): string {
  const pinned = process.env.ASSISTANT_PROVIDER?.trim().toLowerCase();
  if (pinned && !isProviderName(pinned)) {
    return `ASSISTANT_PROVIDER is set to "${pinned}", which is not a known provider. Use "openai" or "groq".`;
  }
  if (pinned && isProviderName(pinned)) {
    return `ASSISTANT_PROVIDER is set to "${pinned}" but ${SPECS[pinned].keyVar} is not set in the server environment.`;
  }
  return "The assistant is not configured. Set OPENAI_API_KEY (or GROQ_API_KEY) in .env.local and restart the server.";
}
