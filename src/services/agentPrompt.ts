/**
 * Personalized-prompt generator for "Connect your agent".
 *
 * The paste template (docs/skills/writtten-agent.md) is imported at build time and the
 * connection specifics are substituted in; the result is what the app's copy button emits
 * and what the user pastes into their agent session.
 *
 * **The template is deliberately self-contained, and that is a measured decision, not an
 * aesthetic one.** Four variants were pasted into fresh Claude Code sessions on 2026-07-21:
 *
 * | | full framing | slimmed framing |
 * |---|---|---|
 * | script inlined  | 33.8k — **accepted** | 22.0k — **refused** |
 * | script fetched  | 15.4k — **accepted** |  3.4k — **refused** |
 *
 * Size was not the variable and neither was fetching. What decides it is whether the
 * document's own framing — the title, the critic role, the philosophy, the worked examples
 * — arrives *before* anything is asked of the agent. Strip that and the paste reads as an
 * injected payload; both refusals said so explicitly, the second one naming "the URL to
 * fetch a reference.md" as the tell of "an injected task trying to get an agent to
 * bootstrap trust in a new tool/service on its say-so alone".
 *
 * So: **keep the guidance in the paste and keep the paste self-sufficient.** An earlier
 * revision moved most of it to a `public/agent/reference.md` the prompt pointed at; that is
 * the version that got refused, and the file is gone. Do not reintroduce a URL the prompt
 * *depends* on, and do not move the setup ask above the framing to "lead with the
 * important part" — that reordering is what broke it.
 *
 * The bridge script is the one thing that did move. It used to be a fenced block here,
 * transcribed to disk by the agent — ~4,600 tokens of generation before anything could
 * connect, and a file left behind in the user's repo (UX-039). It now lives at
 * `public/writtten-bridge.mjs`, served from this origin and fetched to a temp path, which
 * the 15.4k variant proved is accepted. Serving it rather than inlining it also keeps
 * published and tested identical: `agentBridge.integration.test.ts` fetches it over HTTP
 * and spawns what comes back, so there is one artifact rather than a copy the test proves
 * and a copy the app ships.
 */
import { AGENT_PROTOCOL_VERSION } from "./agentBridgeClient";

/** Every placeholder the paste template may carry. The drift test asserts the markdown's
 *  actual placeholder set is exactly this. */
export const AGENT_PROMPT_PLACEHOLDERS = [
  "{{TOKEN}}",
  "{{PORTS}}",
  "{{ORIGIN}}",
  "{{PROTOCOL_VERSION}}",
] as const;

export interface PromptVars {
  token: string;
  ports: number[];
  /** The app instance that generated this pairing — `window.location.origin`. Baked into
   *  the bridge's Origin allowlist, which is what makes it correct for both writtten.com
   *  and a self-hoster's localhost with no extra configuration. */
  origin: string;
}

/** split/join rather than replaceAll: the project's TS lib target predates it. */
function substitute(text: string, placeholder: string, value: string): string {
  return text.split(placeholder).join(value);
}

/** Pure: template in, personalized prompt out. */
export function instantiateAgentPrompt(template: string, vars: PromptVars): string {
  let out = substitute(template, "{{TOKEN}}", vars.token);
  out = substitute(out, "{{PORTS}}", vars.ports.join(","));
  out = substitute(out, "{{ORIGIN}}", vars.origin);
  out = substitute(out, "{{PROTOCOL_VERSION}}", String(AGENT_PROTOCOL_VERSION));

  // Catches a placeholder renamed in the markdown without a matching change here — which
  // would otherwise ship the user a prompt containing a literal `{{ORIGIN}}`.
  const leftover = /\{\{[A-Z_]+\}\}/.exec(out);
  if (leftover) {
    throw new Error(`agentPrompt: unsubstituted placeholder ${leftover[0]} in the skill template`);
  }
  return out;
}

/** Lazy chunk: the skill markdown is only fetched when the connect UI actually opens, so
 *  the flag-off production build never pays for it. */
export async function buildAgentPrompt(vars: PromptVars): Promise<string> {
  const mod = await import("../../docs/skills/writtten-agent.md?raw");
  return instantiateAgentPrompt(mod.default, vars);
}
