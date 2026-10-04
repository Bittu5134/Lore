/**
 * Lore frozen contracts (v1).
 *
 * These types are the interface every lane codes against. Do NOT change a shape
 * here without bumping CONTRACTS_VERSION and telling everyone - lanes run in
 * parallel and integrate against exactly these definitions.
 */

export const CONTRACTS_VERSION = 2;

// ---------------------------------------------------------------------------
// On-disk layout of the .lore store
// ---------------------------------------------------------------------------

export const LORE_DIR = ".lore" as const;

export const LORE_PATHS = {
  config: ".lore/config.json",
  hooks: ".lore/hooks",
  raw: ".lore/raw",
  wiki: ".lore/wiki",
  drafts: ".lore/drafts",
  meta: ".lore/meta",
  events: ".lore/meta/events.jsonl",
  state: ".lore/meta/state.json",
  queue: ".lore/meta/queue.jsonl",
  index: ".lore/wiki/index.md",
  ruleFile: ".clinerules/lore.md",
} as const;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type LoreAutonomy = "auto" | "draft" | "off";
export type LoreThinkingLevel = "none" | "low" | "medium" | "high" | "xhigh";

export interface LoreInferenceConfig {
  /** Only "cline-cli" in v1 - shells out to `cline -p`, reusing existing auth. */
  provider: "cline-cli";
  /** Optional model id passed as `cline -m <model>`. */
  model?: string;
  /** Reasoning effort passed as `cline --thinking <level>`. */
  thinking?: LoreThinkingLevel;
}

export interface LoreConfig {
  version: 1;
  /** "auto" writes to wiki/, "draft" always writes to drafts/, "off" disables compile. */
  autonomy: LoreAutonomy;
  /** Compile results with confidence >= threshold go to wiki/, below go to drafts/. */
  confidenceThreshold: number;
  inference: LoreInferenceConfig;
  /** Glob patterns excluded from watcher + raw capture. */
  ignore: string[];
  /** Reconcile the wiki automatically on post-merge. */
  autoMergeReconcile: boolean;
  /**
   * Absolute path to the Lore installation (set by `lore init`). Lets the capture
   * plugin register the MCP server without guessing where Lore lives.
   */
  loreHome?: string;
}

export const DEFAULT_CONFIG: LoreConfig = {
  version: 1,
  autonomy: "auto",
  confidenceThreshold: 0.6,
  inference: { provider: "cline-cli", thinking: "medium" },
  ignore: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "*.lock",
    "*.log",
    ".lore/meta/**",
    // Secrets: never watched, captured, or documented.
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    "**/*.pem",
    "**/*.key",
    "**/*credential*",
    "**/*secret*",
    "**/id_rsa*",
    "**/id_ed25519*",
  ],
  autoMergeReconcile: true,
};

// ---------------------------------------------------------------------------
// Raw events (append-only, immutable). One JSON object per line in raw/*.jsonl
// ---------------------------------------------------------------------------

export type LoreSource = "cline-session" | "git-commit" | "fs-session" | "manual";

/** Verified CLI hook events (`~/.cline/hooks/hooks.json`, payload on stdin). */
export const CLINE_HOOK_EVENTS = [
  "agent_start",
  "agent_resume",
  "agent_abort",
  "agent_end",
  "agent_error",
  "tool_call",
  "tool_result",
  "prompt_submit",
  "pre_compact",
  "session_shutdown",
] as const;
export type ClineHookEvent = (typeof CLINE_HOOK_EVENTS)[number];

/** Runtime events we consume from the Cline SDK AgentRuntimeEvent union. */
export const CLINE_RUNTIME_EVENTS = [
  "assistant-reasoning-delta",
  "assistant-text-delta",
  "tool-started",
  "tool-finished",
  "run-finished",
  "run-failed",
] as const;
export type ClineRuntimeEvent = (typeof CLINE_RUNTIME_EVENTS)[number];

export type LoreEventKind =
  // agent-sourced
  | "agent_start"
  | "agent_end"
  | "agent_error"
  | "reasoning"
  | "assistant_text"
  | "tool_call"
  | "tool_result"
  | "run_finished"
  // human-sourced
  | "commit"
  | "fs_batch"
  | "manual_note";

export interface LoreEvent {
  /** ISO-8601 timestamp. */
  ts: string;
  source: LoreSource;
  kind: LoreEventKind;
  /** Cline session id, when known. */
  sessionId?: string;
  /** Commit sha, for git-commit events. */
  commit?: string;
  /** Agent loop iteration, when known. */
  iteration?: number;
  /** Kind-specific body. Reasoning text lives in `text`; tool calls in `tool`. */
  payload: LoreEventPayload;
}

export type LoreEventPayload = Record<string, unknown> & {
  /** Reasoning / assistant text (for reasoning + assistant_text). */
  text?: string;
  /** Tool name (for tool_call / tool_result). */
  tool?: string;
  /** Tool parameters (for tool_call). */
  parameters?: Record<string, unknown>;
  /** Tool result (for tool_result). */
  result?: unknown;
  /** Whether the tool call succeeded. */
  success?: boolean;
  /** Commit message (for commit). */
  message?: string;
  /** Changed files (for commit / fs_batch). */
  files?: string[];
  /** Unified diff (for commit). */
  diff?: string;
  /** Cline runtime event type this packet was derived from. */
  runtimeEvent?: ClineRuntimeEvent;
  /** Arbitrary extra fields are allowed. */
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// ADRs (the compiled wiki pages)
// ---------------------------------------------------------------------------

export type AdrStatus = "accepted" | "draft" | "superseded";

export interface AdrFrontmatter {
  /** e.g. "ADR-0001". */
  id: string;
  title: string;
  status: AdrStatus;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** 0..1 confidence from the compiler. */
  confidence: number;
  /** References into the raw layer: session ids, commit shas, event timestamps. */
  sources: string[];
  tags: string[];
}

export interface Adr {
  frontmatter: AdrFrontmatter;
  /** Markdown body: Context / Decision / Alternatives considered / Consequences. */
  body: string;
  /** Repo-relative path, e.g. .lore/wiki/ADR-0001-use-sqlite.md */
  path?: string;
}

// ---------------------------------------------------------------------------
// Compiler - the single entry point every capture lane feeds
// ---------------------------------------------------------------------------

export interface CompileInput {
  /** The events to distil into one (or more) ADRs. */
  events: LoreEvent[];
  /** Existing ADR frontmatter, for id allocation + supersession. */
  existing?: AdrFrontmatter[];
  /** Repo root (absolute) - inference shells out here. */
  repoRoot: string;
  /** Free-form hint about what triggered the compile (for the prompt). */
  reason?: string;
}

export interface CompileResult {
  adr: Adr;
  /** Final confidence (the compiler may lower the model's self-report). */
  confidence: number;
  /** Where the result should land, given config.autonomy + threshold. */
  route: "wiki" | "drafts";
}

export interface Compiler {
  /**
   * Distil captured events into decision records.
   *
   * Returns one result per distinct decision found, most significant first, and
   * an EMPTY array when the events carry no architectural reasoning (so routine
   * commits do not pollute the wiki). v2: was a single CompileResult.
   */
  compile(input: CompileInput): Promise<CompileResult[]>;
}

// ---------------------------------------------------------------------------
// Durable state (meta/state.json) - cursor for incremental processing
// ---------------------------------------------------------------------------

export interface LoreState {
  /** Last processed commit sha (human capture / backfill cursor). */
  lastCommit?: string;
  /** Last processed raw event timestamp. */
  lastEventTs?: string;
  /** Last processed fs watcher batch id. */
  lastFsBatchId?: string;
  /** Monotonic ADR id counter. */
  nextAdrId: number;
}

export const DEFAULT_STATE: LoreState = { nextAdrId: 1 };

// ---------------------------------------------------------------------------
// MCP tool contract (packages/mcp serves these; any MCP client may call them)
// ---------------------------------------------------------------------------

export const MCP_TOOL_NAMES = ["search_lore", "get_adr", "record_decision"] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export interface SearchLoreInput {
  query: string;
  limit?: number;
}
export interface SearchLoreOutput {
  results: Array<{ adrId: string; title: string; snippet: string; score: number }>;
}

export interface GetAdrInput {
  id: string;
}
export interface GetAdrOutput {
  adr: Adr | null;
}

/** One search result row (used by both the linear scan and the FTS index). */
export interface SearchHit {
  adrId: string;
  title: string;
  snippet: string;
  score: number;
}

export interface RecordDecisionInput {
  title: string;
  context: string;
  decision: string;
  alternatives?: string[];
  sources?: string[];
  confidence?: number;
}
export interface RecordDecisionOutput {
  id: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Git hooks contract (written into .lore/hooks, activated via core.hooksPath)
// ---------------------------------------------------------------------------

export const LORE_GIT_HOOKS = ["post-commit", "post-merge"] as const;
export type LoreGitHook = (typeof LORE_GIT_HOOKS)[number];


