/**
 * Personalized-prompt generator for "Connect your agent".
 *
 * The canonical skill (docs/skills/writtten-agent.md) is imported at build time and the
 * connection specifics are substituted in; the result is what the app's copy button emits
 * and what the user pastes into their agent session.
 *
 * Why import the markdown rather than keep a copy of the template in TypeScript: the
 * skill's fenced bridge script IS the artifact the user runs, and
 * `agentBridge.integration.test.ts` spawns that exact fence. A TS duplicate would let the
 * test prove the markdown's script works while the app shipped a different, unexercised
 * one — the same false-green shape `exampleReplay.sync.test.ts` exists to prevent.
 */
import { AGENT_PROTOCOL_VERSION } from "./agentBridgeClient";

/** Every placeholder the skill template may carry. The drift test asserts the markdown's
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
