/**
 * @fileoverview Frozen Core Contracts & Type Definitions for Lore (v1/v2).
 *
 * @description
 * This module defines the architectural contracts, data shapes, runtime events,
 * and storage schemas that underpin the entire Lore ecosystem:
 *  - On-disk layout (`.lore/` layout specifications)
 *  - Configuration schema (`LoreConfig`, `LoreAutonomy`, `LoreThinkingLevel`)
 *  - Captured telemetry events (`LoreEvent`, `LoreEventPayload`, `LoreSource`, `LoreEventKind`)
 *  - Architectural Decision Records (`Adr`, `AdrFrontmatter`, `AdrStatus`)
 *  - Compiler engine signatures (`CompileInput`, `CompileResult`, `Compiler`)
 *  - Persistent state markers (`LoreState`)
 *  - MCP (Model Context Protocol) tool signatures
 *  - Git hook contracts (`LORE_GIT_HOOKS`)
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * These types are frozen. Do NOT alter field names or types without incrementing
 * `CONTRACTS_VERSION` and coordinating across packages (`core`, `cli`, `plugin`, `mcp`).
 */

export const CONTRACTS_VERSION = 2;

// ---------------------------------------------------------------------------
// On-disk layout of the .lore store
// ---------------------------------------------------------------------------

/**
 * Root directory name storing all Lore data inside an instrumented project.
 */
export const LORE_DIR = ".lore" as const;

/**
 * Canonical filesystem paths for all Lore subdirectories and metadata files.
 */
export const LORE_PATHS = {
  /** Project configuration file specifying autonomy and inference settings. */
  config: ".lore/config.json",
  /** Executable git hook scripts (post-commit, post-merge). */
  hooks: ".lore/hooks",
  /** Month-partitioned JSONL files containing raw, immutable event logs. */
  raw: ".lore/raw",
  /** Committed, curated markdown Architectural Decision Records (ADRs). */
  wiki: ".lore/wiki",
  /** Staging ground for low-confidence or unreviewed draft ADRs. */
  drafts: ".lore/drafts",
  /** Local bookkeeping, cursor tracking, locks, and indexing databases. */
  meta: ".lore/meta",
  /** Legacy event log path (kept for backwards compatibility). */
  events: ".lore/meta/events.jsonl",
  /** Machine-local cursor state (lastCommit, lastEventTs, nextAdrId). */
  state: ".lore/meta/state.json",
  /** Queue of pending capture batches awaiting compilation. */
  queue: ".lore/meta/queue.jsonl",
  /** Automatically maintained markdown catalog linking all accepted ADRs. */
  index: ".lore/wiki/index.md",
  /** Agent continuity instructions injected into the Cline system prompt. */
  ruleFile: ".clinerules/lore.md",
} as const;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Autonomy mode governing where compiled ADRs land:
 *  - `"auto"`: High-confidence ADRs route directly to `.lore/wiki/`; low-confidence to `.lore/drafts/`.
 *  - `"draft"`: All generated ADRs route to `.lore/drafts/` for human review.
 *  - `"off"`: Compilation is disabled; only raw telemetry is captured.
 */
export type LoreAutonomy = "auto" | "draft" | "off";

/**
 * Thinking budget level passed to the underlying AI provider (e.g. `cline --thinking <level>`).
 */
export type LoreThinkingLevel = "none" | "low" | "medium" | "high" | "xhigh";

/**
 * Configuration options for the AI inference engine powering compilation.
 */
export interface LoreInferenceConfig {
  /**
   * Inference provider. In v1/v2, defaults to `"cline-cli"` which shells out
   * to the local authenticated `cline -p` CLI command (zero API key overhead).
   */
  provider: "cline-cli";
  /** Optional model identifier override passed to the CLI via `-m <model>`. */
  model?: string;
  /** Reasoning / extended thinking effort level passed via `--thinking <level>`. */
  thinking?: LoreThinkingLevel;
}

/**
 * Top-level structure of `.lore/config.json`.
 */
export interface LoreConfig {
  /** Schema version. */
  version: 1;
  /** Autonomy setting: "auto", "draft", or "off". */
  autonomy: LoreAutonomy;
  /** Confidence score threshold (0.0 to 1.0). Results >= threshold route to wiki; < route to drafts. */
  confidenceThreshold: number;
  /** Settings for calling the inference engine. */
  inference: LoreInferenceConfig;
  /** Filepath glob patterns excluded from observation and capture (e.g. node_modules, secrets). */
  ignore: string[];
  /** Whether to automatically run `lore reconcile` on git post-merge events. */
  autoMergeReconcile: boolean;
  /**
   * Absolute filepath to the Lore monorepo installation root (set by `lore init`).
   * Allows plugins and hooks to locate the CLI without global PATH assumptions.
   */
  loreHome?: string;
}

/**
 * Default fallback configuration applied when `.lore/config.json` is missing or incomplete.
 */
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

/**
 * Identifies the subsystem or channel that produced the telemetry event.
 */
export type LoreSource = "cline-session" | "git-commit" | "fs-session" | "manual";

/**
 * Verified CLI hook event names supported by Cline (`~/.cline/hooks/hooks.json`).
 */
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

/**
 * Runtime telemetry events intercepted from `@cline/sdk` AgentRuntimeEvent stream.
 */
export const CLINE_RUNTIME_EVENTS = [
  "assistant-reasoning-delta",
  "assistant-text-delta",
  "tool-started",
  "tool-finished",
  "run-finished",
  "run-failed",
] as const;
export type ClineRuntimeEvent = (typeof CLINE_RUNTIME_EVENTS)[number];

/**
 * Semantic classification of a normalized Lore telemetry event.
 */
export type LoreEventKind =
  // Agent runtime events
  | "agent_start"
  | "agent_end"
  | "agent_error"
  | "reasoning"
  | "assistant_text"
  | "tool_call"
  | "tool_result"
  | "run_finished"
  // Human developer & filesystem events
  | "commit"
  | "fs_batch"
  | "manual_note";

/**
 * A normalized, append-only event recorded in `.lore/raw/*.jsonl`.
 */
export interface LoreEvent {
  /** ISO-8601 timestamp representing when the event transpired. */
  ts: string;
  /** Telemetry origin (agent session, git hook, filesystem watcher, or manual note). */
  source: LoreSource;
  /** Granular event type. */
  kind: LoreEventKind;
  /** Associated Cline session identifier (if applicable). */
  sessionId?: string;
  /** Commit SHA-1/SHA-256 hash (for git-commit events). */
  commit?: string;
  /** Agent step or iteration index within the run. */
  iteration?: number;
  /** Payload dictionary containing kind-specific telemetry details. */
  payload: LoreEventPayload;
}

/**
 * Key-value payload dictionary carried by a `LoreEvent`.
 */
export type LoreEventPayload = Record<string, unknown> & {
  /** Streamed agent reasoning text or assistant response delta. */
  text?: string;
  /** Name of the invoked tool (e.g., "readFile", "executeCommand"). */
  tool?: string;
  /** Input parameters passed to the tool. */
  parameters?: Record<string, unknown>;
  /** Output or execution response returned by the tool. */
  result?: unknown;
  /** Boolean execution status of the tool call. */
  success?: boolean;
  /** Commit log message (for git commit events). */
  message?: string;
  /** List of files created, modified, or deleted. */
  files?: string[];
  /** Unified git diff representation. */
  diff?: string;
  /** Original Cline runtime event classification that birthed this record. */
  runtimeEvent?: ClineRuntimeEvent;
  /** Additional arbitrary metadata. */
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// ADRs (the compiled wiki pages)
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of an Architectural Decision Record:
 *  - `"accepted"`: Live, active architectural consensus.
 *  - `"draft"`: Proposed record pending human verification.
 *  - `"superseded"`: Deprecated record replaced by a newer ADR.
 */
export type AdrStatus = "accepted" | "draft" | "superseded";

/**
 * Metadata frontmatter parsed from the head of an ADR markdown document.
 */
export interface AdrFrontmatter {
  /** Unique sequential identifier, formatted as `ADR-NNNN` (e.g., "ADR-0001"). */
  id: string;
  /** Imperative, concise decision title (e.g., "Use SQLite FTS5 for Wiki Search"). */
  status: AdrStatus;
  /** ISO date stamp formatted as YYYY-MM-DD. */
  date: string;
  /** Model confidence assessment between 0.0 and 1.0. */
  confidence: number;
  /** Traceability citations (git commit SHAs, session IDs, event timestamps). */
  sources: string[];
  /** Semantic categorization tags (e.g., ["storage", "search", "sqlite"]). */
  tags: string[];
  /** Title of the ADR. */
  title: string;
}

/**
 * Complete in-memory representation of an Architectural Decision Record.
 */
export interface Adr {
  /** Structured YAML frontmatter fields. */
  frontmatter: AdrFrontmatter;
  /**
   * Markdown document body structured with canonical headers:
   *  - `# ADR-NNNN: Title`
   *  - `## Context`
   *  - `## Decision`
   *  - `## Alternatives considered`
   *  - `## Consequences`
   */
  body: string;
  /** Repository-relative path to the file on disk (e.g. `.lore/wiki/ADR-0001-use-sqlite.md`). */
  path?: string;
}

// ---------------------------------------------------------------------------
// Compiler - the single entry point every capture lane feeds
// ---------------------------------------------------------------------------

/**
 * Input bundle supplied to the ADR compilation engine.
 */
export interface CompileInput {
  /** Array of chronological telemetry events to distil. */
  events: LoreEvent[];
  /** Frontmatter of pre-existing ADRs, allowing id allocation and superseding. */
  existing?: AdrFrontmatter[];
  /** Absolute repository root path where inference execution occurs. */
  repoRoot: string;
  /** Human or automated trigger explanation (e.g., "git commit(s) a1b2c3d"). */
  reason?: string;
}

/**
 * Result of distilling events into an architectural decision record.
 */
export interface CompileResult {
  /** The generated ADR instance. */
  adr: Adr;
  /** Effective confidence score after quality evaluations. */
  confidence: number;
  /** Target storage destination based on confidence and autonomy policy. */
  route: "wiki" | "drafts";
}

/**
 * Contract for engines capable of synthesizing telemetry events into ADRs.
 */
export interface Compiler {
  /**
   * Distil captured events into decision records.
   *
   * @param input Compilation parameters including events, repo root, and existing ADRs.
   * @returns An array of generated decisions sorted by significance. Returns an
   *          empty array if the input events describe routine or non-architectural edits.
   */
  compile(input: CompileInput): Promise<CompileResult[]>;
}

// ---------------------------------------------------------------------------
// Durable state (meta/state.json) - cursor for incremental processing
// ---------------------------------------------------------------------------

/**
 * Persistent cursor state stored in `.lore/meta/state.json`.
 * Ensures capture and synchronization operations process only unread events.
 */
export interface LoreState {
  /** SHA hash of the most recently processed git commit. */
  lastCommit?: string;
  /** Timestamp of the most recently processed telemetry event. */
  lastEventTs?: string;
  /** Identifier of the most recently processed filesystem batch. */
  lastFsBatchId?: string;
  /** Next available integer for sequential ADR ID generation (e.g. 19 -> ADR-0019). */
  nextAdrId: number;
}

/**
 * Initial empty cursor state for new Lore installations.
 */
export const DEFAULT_STATE: LoreState = { nextAdrId: 1 };

// ---------------------------------------------------------------------------
// MCP tool contract (packages/mcp serves these; any MCP client may call them)
// ---------------------------------------------------------------------------

/**
 * Tools exposed by Lore's Model Context Protocol server.
 */
export const MCP_TOOL_NAMES = ["search_lore", "get_adr", "record_decision"] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** Input parameters for the `search_lore` MCP tool. */
export interface SearchLoreInput {
  query: string;
  limit?: number;
}

/** Output structure for the `search_lore` MCP tool. */
export interface SearchLoreOutput {
  results: Array<{ adrId: string; title: string; snippet: string; score: number }>;
}

/** Input parameters for the `get_adr` MCP tool. */
export interface GetAdrInput {
  id: string;
}

/** Output structure for the `get_adr` MCP tool. */
export interface GetAdrOutput {
  adr: Adr | null;
}

/**
 * A search match returned by SQLite FTS5 or the linear text scanner.
 */
export interface SearchHit {
  /** The matched ADR ID (e.g., "ADR-0005"). */
  adrId: string;
  /** Title of the matched decision. */
  title: string;
  /** Contextual snippet highlighting query terms. */
  snippet: string;
  /** Relevance ranking score (higher is more relevant). */
  score: number;
}

/** Input parameters for the `record_decision` MCP tool. */
export interface RecordDecisionInput {
  title: string;
  context: string;
  decision: string;
  alternatives?: string[];
  sources?: string[];
  confidence?: number;
}

/** Output structure for the `record_decision` MCP tool. */
export interface RecordDecisionOutput {
  id: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Git hooks contract (written into .lore/hooks, activated via core.hooksPath)
// ---------------------------------------------------------------------------

/**
 * Git lifecycle hooks managed by Lore.
 */
export const LORE_GIT_HOOKS = ["post-commit", "post-merge"] as const;
export type LoreGitHook = (typeof LORE_GIT_HOOKS)[number];
