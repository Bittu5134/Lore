/**
 * @fileoverview Telemetry Event Parsing, Serialization, and Transcript Rendering.
 *
 * @description
 * Manages raw JSONL telemetry streams collected from AI agent sessions, git hooks,
 * and filesystem watchers. Includes the crucial `renderTranscript` function which
 * converts thousands of low-level JSON events into a concise, readable chronological
 * narrative that feeds directly into the LLM compiler prompt.
 */

import type { LoreEvent } from "./types.ts";

/**
 * Parses a single line of JSON into a verified `LoreEvent`.
 *
 * @param line Single JSONL line text.
 * @returns Parsed `LoreEvent` or `null` if the line is empty or malformed.
 */
export function parseEventLine(line: string): LoreEvent | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  try {
    const parsed = JSON.parse(trimmed) as LoreEvent;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.ts !== "string" || typeof parsed.kind !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Serializes a `LoreEvent` into a single-line JSON string suitable for append-only storage.
 *
 * @param event The event to serialize.
 * @returns Compact JSON string.
 */
export function serializeEvent(event: LoreEvent): string {
  return JSON.stringify(event);
}

/**
 * Parses multi-line JSONL content into an array of valid `LoreEvent` objects.
 * Silently drops empty or corrupt lines (fail-open strategy).
 *
 * @param text Entire text read from a `.jsonl` file.
 * @returns Array of parsed events.
 */
export function parseEventsJsonl(text: string): LoreEvent[] {
  const out: LoreEvent[] = [];
  for (const line of text.split("\n")) {
    const event = parseEventLine(line);
    if (event) out.push(event);
  }
  return out;
}

/**
 * Sorts an array of events chronologically by timestamp (`ts`).
 *
 * @param events Unordered array of events.
 * @returns New array sorted in ascending chronological order.
 */
export function sortEvents(events: LoreEvent[]): LoreEvent[] {
  return [...events].sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Helper to truncate lengthy string or object values to protect LLM context windows.
 *
 * @param value String or object to truncate.
 * @param max Maximum allowed character length before truncation.
 * @returns String representation, truncated with character count notice if needed.
 */
function truncate(value: unknown, max = 600): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [${text.length - max} chars truncated]`;
}

/**
 * Renders an array of low-level `LoreEvent` objects into a clean, human-and-model-readable
 * narrative transcript.
 *
 * This transcript serves as the primary "evidence" payload passed to the AI compiler.
 * It emphasizes:
 *  - Inner agent reasoning (`[reasoning]`)
 *  - High-level assistant responses (`[assistant]`)
 *  - Tool invocations and results (`[tool:call]`, `[tool:result]`)
 *  - Git commit messages and unified diffs (`[commit]`)
 *  - Filesystem edit batches (`[edits]`)
 *
 * @param events Chronological or un-ordered array of Lore events.
 * @returns Formatted transcript text ready for prompting.
 */
export function renderTranscript(events: LoreEvent[]): string {
  const lines: string[] = [];
  for (const e of sortEvents(events)) {
    const p = e.payload;
    switch (e.kind) {
      case "reasoning":
        lines.push(`[reasoning] ${truncate(p.text ?? "", 1500)}`);
        break;
      case "assistant_text":
        lines.push(`[assistant] ${truncate(p.text ?? "", 800)}`);
        break;
      case "tool_call":
        lines.push(`[tool:call] ${p.tool ?? "unknown"} ${truncate(p.parameters ?? {})}`);
        break;
      case "tool_result":
        lines.push(
          `[tool:result] ${p.tool ?? "unknown"} ${p.success === false ? "FAILED" : "ok"} -> ${truncate(p.result)}`,
        );
        break;
      case "run_finished":
        lines.push(`[run:finished] status=${p.status ?? "unknown"} ${truncate(p.outputText ?? "", 500)}`);
        break;
      case "agent_start":
        lines.push(`[agent:start] session=${e.sessionId ?? "?"}`);
        break;
      case "agent_end":
        lines.push(`[agent:end] session=${e.sessionId ?? "?"}`);
        break;
      case "agent_error":
        lines.push(`[agent:error] ${truncate(p.error ?? p.message ?? "")}`);
        break;
      case "commit":
        lines.push(
          `[commit ${(e.commit ?? "").slice(0, 8)}] ${p.message ?? ""}\n` +
            `  files: ${(p.files ?? []).join(", ")}\n` +
            `  diff:\n${truncate(p.diff ?? "", 3000)}`,
        );
        break;
      case "fs_batch":
        lines.push(`[edits] ${(p.files ?? []).join(", ")}${p.note ? ` (${String(p.note)})` : ""}`);
        break;
      case "manual_note":
        lines.push(`[note] ${truncate(p.text ?? "")}`);
        break;
    }
  }
  return lines.join("\n");
}
