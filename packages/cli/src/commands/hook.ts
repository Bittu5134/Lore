/**
 * @fileoverview `lore hook` Command Implementation.
 *
 * @description
 * Ingestion adapter for Cline CLI runtime lifecycle hooks (`~/.cline/hooks/hooks.json`).
 *
 * Execution Invariants:
 *  - Standard Input Ingestion: Reads JSON payload streamed over stdin.
 *  - Normalization: Maps Cline hook primitives (`agent_start`, `tool_call`, `tool_result`,
 *    `prompt_submit`, etc.) into canonical `LoreEvent` records.
 *  - Fail-Open Execution: Must NEVER interrupt or crash the calling agent host; any error
 *    cleanly exits with code 0.
 *  - Append-Only Persistence: Appends normalized records directly to `.lore/raw/cli-hooks.jsonl`.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CLINE_HOOK_EVENTS, LORE_PATHS, type LoreEvent, type LoreEventKind } from "@lore/core";

/** Reads the entire standard input stream into a string buffer. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const KIND_BY_EVENT: Partial<Record<string, LoreEventKind>> = {
  agent_start: "agent_start",
  agent_end: "agent_end",
  agent_error: "agent_error",
  tool_call: "tool_call",
  tool_result: "tool_result",
  prompt_submit: "manual_note",
  pre_compact: "agent_start",
  session_shutdown: "agent_end",
};

/**
 * Normalizes incoming CLI hook events into standard LoreEvent structures.
 *
 * @param event Event type string from argv.
 * @param raw Parsed JSON payload from stdin.
 * @returns Structured LoreEvent.
 */
function normalise(event: string, raw: Record<string, unknown>): LoreEvent {
  const pre = (raw.preToolUse ?? {}) as Record<string, unknown>;
  const post = (raw.postToolUse ?? {}) as Record<string, unknown>;
  const prompt = (raw.userPromptSubmit ?? {}) as Record<string, unknown>;

  const payload: Record<string, unknown> = { hookEvent: event, ...raw };
  if (event === "tool_call") {
    payload.tool = pre.toolName ?? raw.toolName ?? "unknown";
    payload.parameters = pre.parameters ?? {};
  } else if (event === "tool_result") {
    payload.tool = post.toolName ?? raw.toolName ?? "unknown";
    payload.parameters = post.parameters ?? {};
    payload.result = post.result ?? raw.result ?? null;
    payload.success = post.success ?? raw.success ?? null;
  } else if (event === "prompt_submit") {
    payload.text = prompt.prompt ?? raw.prompt ?? "";
  }

  const sessionId = (raw.sessionId as string | undefined) ?? (raw.session_id as string | undefined);
  return {
    ts: new Date().toISOString(),
    source: "cline-session",
    kind: KIND_BY_EVENT[event] ?? "manual_note",
    ...(sessionId ? { sessionId } : {}),
    payload,
  };
}

/**
 * Executes the `lore hook` command.
 *
 * @param args Command line arguments (`<event_name>`).
 */
export async function run(args: string[]): Promise<void> {
  const event = args[0] ?? "";
  try {
    if (!(CLINE_HOOK_EVENTS as readonly string[]).includes(event)) {
      return; // Unknown event: stay silent, never break the host
    }
    const text = (await readStdin()).trim();
    const raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const loreRoot = join(process.cwd(), LORE_PATHS.raw);
    mkdirSync(loreRoot, { recursive: true });
    appendFileSync(join(loreRoot, "cli-hooks.jsonl"), JSON.stringify(normalise(event, raw)) + "\n");
  } catch {
    // Fail-open: capture must never block or crash the agent loop
  }
}
