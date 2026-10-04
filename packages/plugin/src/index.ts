/**
 * Lane 2 - Lore capture plugin.
 *
 * Registered with Cline via `cline plugin install ./packages/plugin`. Its
 * `onEvent` hook receives every AgentRuntimeEvent and appends a normalised
 * LoreEvent to .lore/raw/. This is how Lore observes the agent's reasoning
 * stream - the one thing MCP tools cannot do.
 *
 * Runtime imports are limited to node:* so this stays a valid single-file
 * plugin; everything is wrapped in try/catch so capture can never break or
 * slow down the agent loop.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface RuntimeEventLike {
  type: string;
  iteration?: number;
  text?: string;
  accumulatedText?: string;
  toolCall?: { toolName?: string; input?: unknown; toolCallId?: string };
  message?: unknown;
  result?: unknown;
  status?: string;
  outputText?: string;
  error?: { message?: string };
}

function rawDir(): string {
  const root = process.env.LORE_ROOT ?? process.cwd();
  const dir = join(root, ".lore", "raw");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function truncate(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function toRecord(event: RuntimeEventLike): Record<string, unknown> | null {
  const base = { ts: new Date().toISOString(), source: "cline-session", iteration: event.iteration };

  switch (event.type) {
    case "assistant-reasoning-delta":
      return {
        ...base,
        kind: "reasoning",
        payload: { runtimeEvent: event.type, text: event.text ?? event.accumulatedText ?? "" },
      };
    case "assistant-text-delta":
      return {
        ...base,
        kind: "assistant_text",
        payload: { runtimeEvent: event.type, text: event.text ?? event.accumulatedText ?? "" },
      };
    case "tool-started":
      return {
        ...base,
        kind: "tool_call",
        payload: {
          runtimeEvent: event.type,
          tool: event.toolCall?.toolName ?? "unknown",
          parameters: (event.toolCall?.input ?? {}) as Record<string, unknown>,
        },
      };
    case "tool-finished":
      return {
        ...base,
        kind: "tool_result",
        payload: {
          runtimeEvent: event.type,
          tool: event.toolCall?.toolName ?? "unknown",
          result: truncate(event.message ?? event.result ?? null, 2000),
          success: true,
        },
      };
    case "run-finished":
      return {
        ...base,
        kind: "run_finished",
        payload: {
          runtimeEvent: event.type,
          status: event.status ?? "completed",
          outputText: truncate(event.outputText ?? "", 4000),
        },
      };
    case "run-failed":
      return {
        ...base,
        kind: "agent_error",
        payload: { runtimeEvent: event.type, error: event.error?.message ?? "unknown error" },
      };
    default:
      return null;
  }
}

function capture(event: RuntimeEventLike): void {
  try {
    const record = toRecord(event);
    if (!record) return;
    appendFileSync(join(rawDir(), "session.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // fail-open: capture must never block the agent loop
  }
}

const lorePlugin = {
  name: "lore",
  manifest: {
    capabilities: ["hooks"],
  },
  hooks: {
    onEvent(event: unknown): void {
      capture(event as RuntimeEventLike);
    },
  },
};

export default lorePlugin;
export { capture as captureRuntimeEvent, toRecord as runtimeEventToRecord };
