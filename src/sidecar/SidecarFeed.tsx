import { useState } from "react";
import { createGeminiRouter } from "../model/gemini";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

export function SidecarFeed() {
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  async function ping() {
    if (!apiKey) {
      setPingResult("No VITE_GEMINI_API_KEY in .env.local");
      return;
    }
    setPinging(true);
    setPingResult(null);
    try {
      const router = createGeminiRouter(apiKey);
      const res = await router.fast({
        system: "You are a helpful assistant.",
        user: "Reply with exactly three words: model router works.",
      });
      setPingResult(`✓ ${res.text.trim()}`);
    } catch (e) {
      setPingResult(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPinging(false);
    }
  }

  return (
    <aside className="sidecar-panel">
      <div className="ping-bar">
        <button onClick={ping} disabled={pinging}>
          {pinging ? "…" : "Ping model"}
        </button>
        {pingResult && <span className="ping-result">{pingResult}</span>}
      </div>
      <p className="sidecar-empty">
        Observations will appear here as you write.
        <br />
        Quiet for now — keep going.
      </p>
    </aside>
  );
}
