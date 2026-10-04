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
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function loreRoot(): string {
  return process.env.LORE_ROOT ?? process.cwd();
}

/**
 * True while Lore is running its own `cline` inference (`lore compile`/`sync`).
 * Cline may sandbox plugins without inheriting our env vars, so this filesystem
 * marker - written by the compiler - is the reliable signal.
 */
function inferenceInFlight(): boolean {
  try {
    const stat = statSync(join(loreRoot(), ".lore", "meta", "inference.lock"));
    return Date.now() - stat.mtimeMs < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

interface LoreConfigLite {
  loreHome?: string;
  ignore?: string[];
}

function readLoreConfig(root: string): LoreConfigLite | null {
  try {
    return JSON.parse(readFileSync(join(root, ".lore", "config.json"), "utf8")) as LoreConfigLite;
  } catch {
    return null;
  }
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // (?<![A-Za-z0-9]) avoids mangling ordinary words such as "risk-management-…".
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g, "[redacted-openai-key]"],
  [/(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{20,}/g, "[redacted-github-token]"],
  [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, "[redacted-aws-key]"],
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g, "[redacted-private-key]"],
  [/((?:\bkey\b|\btoken\b|\bsecret\b|\bpassword\b|\bpasswd\b|\bapi[_-]?key\b)\s*[:=]\s*)(["']?)(?!\[redacted)([^\s"',]{6,})/gi, "$1$2[redacted]"],
];

/** Best-effort secret masking - applied before anything is written to disk. */
function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function redactValue(node: unknown): string {
  try {
    return redact(typeof node === "string" ? node : JSON.stringify(node ?? null));
  } catch {
    return "[unserialisable]";
  }
}

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
  const dir = join(loreRoot(), ".lore", "raw");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function truncate(value: unknown, max: number): string {
  const text = redactValue(value);
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Recursively redact every string inside an object/array (tool parameters). */
function redactDeep(node: unknown): unknown {
  if (typeof node === "string") return redact(node);
  if (Array.isArray(node)) return node.map((item) => redactDeep(item));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = redactDeep(value);
    }
    return out;
  }
  return node;
}

/** Files whose contents must never be captured verbatim. */
const SENSITIVE_PATH = /(^|[\\/])\.env|\.pem$|\.key$|id_rsa|id_ed25519|credentials|secret/i;

function touchesSensitiveFile(event: RuntimeEventLike): boolean {
  const input = event.toolCall?.input;
  if (!input) return false;
  try {
    return SENSITIVE_PATH.test(JSON.stringify(input));
  } catch {
    return false;
  }
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

function capture(event: RuntimeEventLike): void {
  try {
    // Never record the events of Lore's own inference runs.
    if (process.env.LORE_INTERNAL || inferenceInFlight()) return;

    // Opt-in only: capture just in repositories that ran `lore init`. Without
    // this, installing the plugin would silently create .lore/ folders in every
    // unrelated project the user happens to run an agent in.
    if (!existsSync(join(loreRoot(), ".lore", "config.json"))) return;

    // Never capture operations on secrets/credentials.
    if (touchesSensitiveFile(event)) return;

    const record = toRecord(event);
    if (!record) return;
    appendFileSync(join(rawDir(), "session.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // fail-open: capture must never block the agent loop
  }
}

/**
 * Continuity injection: instead of hoping the model reads `.clinerules`, the
 * plugin registers a rule containing the repository's decision index, so every
 * session starts already knowing what was decided here.
 */
function continuityRule(root: string): string {
  const wiki = join(root, ".lore", "wiki");
  let titles: string[] = [];
  try {
    titles = readdirSync(wiki)
      .filter((f) => /^ADR-\d{4}-.*\.md$/.test(f))
      .slice(0, 40)
      .map((file) => {
        const text = readFileSync(join(wiki, file), "utf8");
        const id = /^id:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? file.slice(0, 8);
        const title = /^title:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? file;
        return `- ${id}: ${title}`;
      });
  } catch {
    titles = [];
  }

  const known = titles.length > 0 ? titles.join("\n") : "(the wiki is empty so far)";
  return [
    "# Lore — Architectural Memory",
    "",
    "This repository keeps its architectural decision records (ADRs) in `.lore/wiki/`.",
    "They record WHY the code is the way it is.",
    "",
    "Before editing: read the decision index below, then open the 1-3 ADRs that match your task",
    "(read at most 3 - respect the context budget). If you contradict a recorded decision, say so",
    "explicitly in your final answer. When you make a non-obvious choice, record it: call the",
    "`record_decision` tool if the Lore MCP server is available, otherwise write an ADR into",
    "`.lore/drafts/` using `.lore/wiki/ADR-0000-template.md` (include the alternatives you rejected).",
    "Never edit `.lore/raw/` or `.lore/meta/`.",
    "",
    "## Known decisions",
    "",
    known,
  ].join("\n");
}

/** Minimal structural view of the plugin API we use (keeps this file dependency-free). */
interface LorePluginApi {
  registerRule?: (rule: {
    id: string;
    content: string | (() => string | Promise<string>);
    source?: string;
  }) => void;
  registerMcpServer?: (server: {
    name: string;
    transport: {
      type: "stdio";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
    };
  }) => void;
}

const lorePlugin = {
  name: "lore",
  manifest: {
    capabilities: ["hooks", "rules", "mcp"],
  },
  setup(api: LorePluginApi): void {
    const root = loreRoot();
    // Opt-in: stay completely inert in repositories that never ran `lore init`.
    if (!existsSync(join(root, ".lore", "config.json"))) return;

    // 1. Continuity injection - every session starts knowing what was decided here.
    api.registerRule?.({
      id: "lore-continuity",
      source: "lore",
      content: () => continuityRule(root),
    });

    // 2. Register the Lore MCP server so any client (including the VS Code
    //    extension) gets search_lore / get_adr / record_decision without a
    //    manual config edit. `lore init` records where Lore lives.
    const loreHome = readLoreConfig(root)?.loreHome;
    if (loreHome) {
      const mcpEntry = join(loreHome, "packages", "mcp", "src", "index.ts");
      if (existsSync(mcpEntry)) {
        api.registerMcpServer?.({
          name: "lore",
          transport: {
            type: "stdio",
            command: "npx",
            args: ["--yes", "tsx", mcpEntry],
            cwd: root,
            env: { LORE_ROOT: root },
          },
        });
      }
    }
  },
  hooks: {
    onEvent(event: unknown): void {
      capture(event as RuntimeEventLike);
    },
  },
};

export default lorePlugin;
export { capture as captureRuntimeEvent, toRecord as runtimeEventToRecord };
