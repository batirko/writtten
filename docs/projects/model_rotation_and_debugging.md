---
status: in-progress
phases: [1, 3]
summary: Handles Gemini free-tier rate limits via call batching, model rotation, and a debug panel; adds local Ollama fallback for offline dev.
---

# Model Rotation, Rate Limit Resiliency, and LLM Debugging

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Phase scope:** Phase 1 (call batching ✅) · Phase 3 (rotation, cool-down, debug panel ✅; Ollama + tiering pending) **Summary:** Handles Gemini free-tier rate limits via call batching, model rotation, and a debug panel; adds local Ollama fallback for offline dev.

---

## Phased Plan

| Phase       | Contribution                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | Merge the three per-block fast calls (summarize, claims, clarity) into one structured-output call, cutting RPM pressure before rotation is ever needed. |
| **Phase 3** | Full rotation pool with cool-down registry and exponential backoff; Ollama integration for offline dev; LLM debug panel.                                |

---

## Todo

### Phase 1

- [x] Merge `summarize` + `extract claims` + `clarity check` into a single structured-output `router.fast` call per block (one round-trip, JSON response with all three outputs).
- [x] Confirm the merged call does not degrade contradiction check quality downstream.

### Phase 3

- [x] Implement **cool-down registry** inside the model router (not at call sites); mark a model unavailable on 429, honoring the `retry-delay` response header when present, defaulting to 45 s.
- [x] Wire **rotation pools** (see §2 below) with exponential backoff (500 ms base).
- [ ] Implement **Ollama health check** on startup; enable local fallbacks when active.
- [ ] Proxy `/api/ollama` in `vite.config.ts` (CORS workaround).
- [x] Surface active provider (model name + source) in the sidecar status bar and debug panel — never silently degrade without the user knowing.
- [x] Build **LLM debug panel** (collapsible, bottom of sidecar feed) with structured `LLMLogEntry` log and JSON inspector.
- [x] Log rotation/fallback events as `retry` and `fallback` entry types so degradation is always visible in debug mode.

---

## 1. The Rate Limit Challenge

In development mode (using Google AI Studio's free tier), the application triggers LLM calls per block evaluation:

1. **Summarize + extract claims + clarity check** (`router.fast`) — merged into one structured-output call in Phase 1.
2. **Contradiction check** (`router.strong`)

With Gemini's free tier limit of **15 RPM** for Flash models, merging the three fast calls is the primary fix — it reduces per-block cost from 3 fast calls to 1. Model rotation covers residual bursts and `strong`-tier pressure.

---

## 2. Detection & Rotation Architecture

### Rate Limit Detection

When an LLM call fails with **`429 Too Many Requests`**, the resiliency pipeline triggers. Honor the `retry-delay` header when present; use 45 s as the default cool-down if the header is absent.

```typescript
if (res.status === 429) {
  const delay = parseRetryDelay(res.headers) ?? 45_000;
  coolDownRegistry.markUnavailable(model, delay);
}
```

### Rotation lives in the model router

All retry, rotation, and backoff logic belongs inside the **model-router** module — the deliberate extension seam described in `docs/architecture.md`. Call sites invoke `router.fast()` or `router.strong()` and never see provider details.

### Model Pools

Rate limits in Google AI Studio are tracked **per model**, so rotating to a different model under the same API key can bypass a limit.

| Tier         | Primary            | Fallback pool (in order) | Notes                        |
| ------------ | ------------------ | ------------------------ | ---------------------------- |
| **`fast`**   | `gemini-3.5-flash` | `gemini-2.5-flash`       | Fast and reliable fallbacks. |
| **`strong`** | `gemini-3.5-flash` | `gemini-2.5-flash`       | Used for deeper checks.      |

### Rotation & Cool-down Flow

1. **Try primary model.** Attempt the call.
2. **On 429:**
   - Record the model in the **cool-down registry** with the `retry-delay`-derived duration.
   - Wait using **exponential backoff** (500 ms base).
   - Rotate to the next model in the pool.
1. **Pool exhausted:** fall back to local Ollama (if active) or surface a user-friendly "AI cooldown" warning. Never fail silently.

---

## 3. Local LLM Integration (Ollama)

For zero-rate-limit offline development, calls can route to a local Ollama server.

### CORS & Proxying

To avoid browser CORS blocks, proxy `/api/ollama` in `vite.config.ts`:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
    },
  },
});
```

### Startup Health Check & Model Suggestions

The app pings `/api/ollama/api/tags` on load. If active, local fallbacks are enabled and the status bar reflects the active provider.

| Tier     | Suggested local models                                                   |
| -------- | ------------------------------------------------------------------------ |
| `fast`   | `qwen2.5:3b-instruct`, `gemma2:2b-instruct` (50+ tok/s on Apple Silicon) |
| `strong` | `llama3:8b`, `qwen2.5:7b-instruct`                                       |

---

## 4. LLM Debug Panel

A togglable **Debug Mode** that logs all outgoing and incoming API data, including rotation and fallback events. Essential for diagnosing free-tier flakiness.

### Logger Structure (`llmLogger.ts`)

```typescript
interface LLMLogEntry {
  id: string;
  timestamp: Date;
  type: 'request' | 'response' | 'retry' | 'fallback' | 'error';
  model: string;
  endpoint: string;
  latencyMs?: number;
  statusCode?: number;
  payload: {
    system: string;
    user: string;
  };
  response?: string;
  errorMessage?: string;
}
```

### UI

When Debug Mode is enabled:

1. **Collapsible panel** at the bottom of the Sidecar feed.
2. **Status colors:** green = success, yellow = retry/rotation/backoff, red = exhausted or fatal.
3. **JSON inspector** on each entry — raw outgoing prompt (`system` + `user`) and response text or JSON.
4. **Active provider chip** in the sidecar status bar (always visible, not just in debug mode) — shows the model that produced the last observation so the user knows when quality has degraded.
