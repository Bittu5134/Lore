/**
 * `lore hook <event>` - capture adapter for Cline CLI runtime hooks.
 *
 * The CLI delivers a JSON payload on stdin (verified events: agent_start,
 * agent_resume, agent_abort, agent_end, agent_error, tool_call, tool_result,
 * prompt_submit, pre_compact, session_shutdown). We normalise it into a
 * LoreEvent and append it to the immutable raw log.
 *
 * MUST never fail the host: any error exits 0.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CLINE_HOOK_EVENTS, LORE_PATHS, type LoreEvent, type LoreEventKind } from "@lore/core";

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

export async function run(args: string[]): Promise<void> {
  const event = args[0] ?? "";
  try {
    if (!(CLINE_HOOK_EVENTS as readonly string[]).includes(event)) {
      return; // unknown event: stay silent, never break the host
    }
    const text = (await readStdin()).trim();
    const raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const loreRoot = join(process.cwd(), LORE_PATHS.raw);
    mkdirSync(loreRoot, { recursive: true });
    appendFileSync(join(loreRoot, "cli-hooks.jsonl"), JSON.stringify(normalise(event, raw)) + "\n");
  } catch {
    // fail-open: capture must never block the agent loop
  }
}
