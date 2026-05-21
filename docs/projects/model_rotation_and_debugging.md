# Model Rotation, Rate Limit Resiliency, and LLM Debugging

This document outlines the architecture, model choices, and implementation details for handling rate limits (429s), model rotation pools, local LLM integration, and real-time debugging inside the Sidecar application.

---

## 1. The Rate Limit Challenge

In development mode (using Google AI Studio's free tier), the application triggers multiple sequential LLM calls per block evaluation:

1. **Summarize** (`router.fast`)
2. **Extract claims** (`router.fast`)
3. **Clarity check** (`router.fast`)
4. **Contradiction check** (`router.strong`)

With Gemini's free tier limit of **15 RPM (Requests Per Minute)** for Flash models, editing 4 blocks in a single minute will exhaust the quota and block evaluation. In production (GA), rate limits can still occur due to sudden user activity bursts, upstream outages, or billing thresholds.

To solve this, we implement **Rate Limit Resiliency** using detection, backoff retries, model rotation pools, and local LLM fallbacks.

---

## 2. Detection & Rotation Architecture

### Rate Limit Detection

When an LLM call fails, the client checks the HTTP status code. A status code of **`429 Too Many Requests`** triggers the resiliency pipeline:

```typescript
if (res.status === 429) {
  // Trigger rotation/backoff logic
}
```

### Model Pools

In Google AI Studio, rate limits are tracked **per model**. Therefore, rotation to a different model under the same API key can bypass rate limits. We define two pools:

| Feature      | Primary Model      | Fallback Pool (in order)                   | Rationale                                                                                                                     |
| ------------ | ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **`fast`**   | `gemini-2.0-flash` | `gemini-1.5-flash-8b` → `gemini-1.5-flash` | `1.5-flash-8b` is extremely lightweight and fast, making it a perfect fallback for basic summarization and claims extraction. |
| **`strong`** | `gemini-1.5-pro`   | `gemini-2.0-flash` → `gemini-1.5-flash`    | `1.5-pro` is smart but limited to **2 RPM** on free tiers. If it fails, we fall back to the faster Flash models.              |

### Rotation & Cool-down Flowchart

1. **Try Primary Model**: Attempt the call.
2. **On 429 Exception**:
   - Mark the model in a local `Cool-down Registry` (e.g., skip it for the next 45 seconds).
   - Wait briefly using **Exponential Backoff** (e.g., 500ms).
   - Rotate to the next model in the pool.
1. **Exhaustion**: If all models in the pool fail, fall back to the local LLM (if active) or throw a user-friendly "AI Cooldown" warning.

---

## 3. Local LLM Integration (Ollama)

For zero-rate-limit offline development, the application can route calls to a local Ollama server running Llama or Qwen models.

### CORS & Proxying

To avoid browser CORS blocks, we proxy `/api/ollama` in `vite.config.ts`:

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

### Models & Auto-Detection

- **Startup Health Check**: The app pings `/api/ollama/api/tags` on load. If active, local fallbacks are enabled.
- **Suggested Local Models**:
  - For `fast`: `qwen2.5:3b-instruct` or `gemma2:2b-instruct` (lightweight, runs at 50+ tokens/sec on Apple Silicon).
  - For `strong`: `llama3:8b` or `qwen2.5:7b-instruct`.

---

## 4. LLM Debug Mode & Panel

To make model execution transparent, the application includes a togglable **Debug Mode** that logs all outgoing and incoming API data.

### Logger Structure (`llmLogger.ts`)

A central reactive store captures logs of each transaction:

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

### UI Presentation

When Debug Mode is enabled:

1. **Collapsible Panel**: Appears at the bottom of the Sidecar Feed.
2. **Visual Status**:
   - 🟢 **Green** for successful responses.
   - 🟡 **Yellow** for retries, rotation events, and backoffs.
   - 🔴 **Red** for exhausted limits or fatal errors.
1. **JSON Inspector**: Click on any entry to inspect raw outgoing prompts (`system` & `user`) and incoming text responses or raw JSON.
