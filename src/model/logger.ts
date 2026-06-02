import { nanoid } from "nanoid";

export interface LLMLogEntry {
  id: string;
  timestamp: Date;
  type: "trigger" | "request" | "response" | "retry" | "fallback" | "error";
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
  // Populated for "trigger" entries
  triggerKind?: string;
  blockId?: string;
}

type LogCallback = (logs: LLMLogEntry[], activeProvider: string) => void;

class LLMLogger {
  private logs: LLMLogEntry[] = [];
  private activeProvider = "gemini-2.0-flash";
  private listeners: Set<LogCallback> = new Set();
  private maxLogs = 50;

  subscribe(callback: LogCallback): () => void {
    this.listeners.add(callback);
    callback([...this.logs], this.activeProvider); // Initial state push
    return () => this.listeners.delete(callback);
  }

  private notify() {
    const logsCopy = [...this.logs];
    for (const listener of this.listeners) {
      listener(logsCopy, this.activeProvider);
    }
  }

  setActiveProvider(provider: string) {
    if (this.activeProvider !== provider) {
      this.activeProvider = provider;
      this.notify();
    }
  }

  getActiveProvider(): string {
    return this.activeProvider;
  }

  log(entry: Omit<LLMLogEntry, "id" | "timestamp">) {
    const fullEntry: LLMLogEntry = {
      ...entry,
      id: nanoid(10),
      timestamp: new Date(),
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    
    this.notify();
  }
}

export const llmLogger = new LLMLogger();
