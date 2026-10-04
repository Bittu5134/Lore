/**
 * Raw event parsing + transcript rendering.
 */
import type { LoreEvent } from "./types.ts";

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

export function serializeEvent(event: LoreEvent): string {
  return JSON.stringify(event);
}

export function parseEventsJsonl(text: string): LoreEvent[] {
  const out: LoreEvent[] = [];
  for (const line of text.split("\n")) {
    const event = parseEventLine(line);
    if (event) out.push(event);
  }
  return out;
}

export function sortEvents(events: LoreEvent[]): LoreEvent[] {
  return [...events].sort((a, b) => a.ts.localeCompare(b.ts));
}

function truncate(value: unknown, max = 600): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [${text.length - max} chars truncated]`;
}

/**
 * Human-readable transcript of captured events. This is the compiler's evidence.
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
