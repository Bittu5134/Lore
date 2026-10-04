import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeEventLike } from "./types.ts";
import { redactValue, redactDeep, touchesSensitiveFile } from "./redact.ts";
import {
  loreRoot,
  inferenceInFlight,
  readLoreConfig,
  spawnDetachedCompile,
} from "./compile.ts";

export function rawDir(): string {
  const dir = join(loreRoot(), ".lore", "raw");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function truncate(value: unknown, max: number): string {
  const text = redactValue(value);
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function toRecord(event: RuntimeEventLike): Record<string, unknown> | null {
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
          parameters: (redactDeep(event.toolCall?.input ?? {}) ?? {}) as Record<string, unknown>,
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

export function capture(event: RuntimeEventLike): void {
  try {
    const root = loreRoot();

    // Never record the events of Lore's own inference runs.
    if (process.env.LORE_INTERNAL || inferenceInFlight()) return;

    // Opt-in only: capture just in repositories that ran `lore init`.
    if (!existsSync(join(root, ".lore", "config.json"))) return;

    // Never capture operations on secrets/credentials.
    if (touchesSensitiveFile(event)) return;

    const record = toRecord(event);
    if (!record) return;
    appendFileSync(join(rawDir(), "session.jsonl"), `${JSON.stringify(record)}\n`, "utf8");

    // The run is over -> decisions write themselves.
    const sessionEnded = event.type === "run-finished" || event.type === "run-failed";
    if (sessionEnded && !inferenceInFlight()) {
      const config = readLoreConfig(root);
      if (config && config.autonomy !== "off") {
        spawnDetachedCompile(root);
      }
    }
  } catch {
    // fail-open: capture must never break or slow the agent loop
  }
}
