/**
 * The ADR compiler: turn captured events into one architectural decision record.
 *
 * Inference shells out to `cline -p` (reusing the user's existing Cline auth),
 * but is injectable so tests never touch the network.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Adr, AdrFrontmatter, CompileInput, CompileResult, Compiler, LoreConfig } from "./types.ts";
import { numericId, padId } from "./adr.ts";
import { renderTranscript } from "./events.ts";

export type InferenceFn = (prompt: string, repoRoot: string) => string;

export interface CompilerOptions {
  /** Injected inference - defaults to `cline -p`. Tests pass a fake. */
  infer?: InferenceFn;
  /** Clock injection for deterministic dates. */
  now?: () => Date;
}

export const DECISION_JSON_SHAPE = `{"decisions":[{"title": string, "context": string, "decision": string, "alternatives": string[], "consequences": string, "confidence": number, "tags": string[], "supersedes": string | null}]}`;

const PROMPT_HEADER = [
  "You are Lore, an architectural-decision recorder for a software repository.",
  "You will receive EVENTS captured while code was being written: an AI agent's reasoning and tool activity,",
  "and/or git commits with diffs. Distil them into decision records that capture WHY - the part that diffs",
  "and commit messages never show.",
  "",
  "Rules:",
  "- Emit up to 3 decisions, most significant first.",
  "- Emit an EMPTY array when the events contain no architectural reasoning (formatting, typos, generated",
  "  files, dependency bumps, routine refactors). Silence is better than noise.",
  "- Base every claim on the events. Never invent facts. Thin evidence -> lower confidence.",
  '- "alternatives": options that were considered and REJECTED, each with the reason. Use [] if none appear.',
  '- "supersedes": the id of an EXISTING decision (listed below) that this change replaces, else null.',
  "  Never duplicate a decision that is already recorded.",
  "- title: imperative and specific, 80 characters or fewer.",
  "- confidence: 0..1 - how certain you are the record faithfully captures the reasoning.",
  "- Escape newlines inside strings as \\n. Output valid JSON only.",
  "",
  "Respond with a single JSON object and NOTHING else (no prose, no code fences):",
  DECISION_JSON_SHAPE,
].join("\n");

interface RawDecision {
  title?: unknown;
  context?: unknown;
  decision?: unknown;
  alternatives?: unknown;
  consequences?: unknown;
  confidence?: unknown;
  tags?: unknown;
  sources?: unknown;
  supersedes?: unknown;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter((v) => v !== "");
}

export function buildPrompt(
  transcript: string,
  existing: AdrFrontmatter[] = [],
  reason?: string,
): string {
  const existingList =
    existing.length > 0 ? existing.map((a) => `- ${a.id}: ${a.title}`).join("\n") : "(none)";
  const header = reason ? `${PROMPT_HEADER}\n\nTrigger: ${reason}` : PROMPT_HEADER;
  return (
    `${header}\n\n` +
    `EXISTING DECISIONS (do not duplicate; supersede if replaced):\n${existingList}\n\n` +
    `EVENTS CAPTURED:\n${transcript.slice(0, 12000)}`
  );
}

function repairControlChars(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of input) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Collect balanced {...} objects that could be a decision record. */
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i] ?? "";
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const slice = text.slice(start, i + 1);
          // cheap prefilter: only objects that mention a decision key
          if (
            slice.includes('"title"') ||
            slice.includes('"decision"') ||
            slice.includes('"decisions"')
          ) {
            candidates.push(slice);
          }
          break;
        }
      }
    }
  }
  return candidates;
}

function looksLikeDecision(value: unknown): value is RawDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return "title" in record || "decision" in record || "context" in record;
}

/**
 * Parse the model's reply into decision records. Accepts either the v2 envelope
 * `{"decisions":[...]}`, a bare array, or a single legacy object.
 *
 * `cline -p` prints its [thinking] stream to stdout and the thinking often quotes
 * the requested JSON schema, so the FIRST valid-looking fragment is not the
 * answer - we try candidates from the END (the final answer comes last).
 */
export function parseDecisionsJson(text: string): RawDecision[] {
  const withoutFences = text.replace(/```json/gi, "```").replace(/```/g, "");
  const candidates = extractJsonCandidates(withoutFences);

  // Scan from the end (the answer comes last). Prefer a `{"decisions":[...]}`
  // envelope over bare objects: nested decision objects appear *after* the
  // envelope in the text, so they must not win the race.
  let fallback: RawDecision[] | null = null;

  for (const candidate of candidates.reverse()) {
    for (const attempt of [candidate, repairControlChars(candidate)]) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(attempt);
      } catch {
        continue; // try the repaired / next candidate
      }
      if (typeof parsed !== "object" || parsed === null) continue;

      const record = parsed as Record<string, unknown>;
      if (Array.isArray(record.decisions)) {
        // Envelope wins - including an intentionally EMPTY array (no decisions).
        return record.decisions.filter(looksLikeDecision);
      }
      if (fallback === null && looksLikeDecision(parsed)) {
        fallback = [parsed as RawDecision];
      }
    }
  }

  if (fallback !== null) return fallback;
  throw new Error(
    `inference did not return a decision object | raw: ${text.slice(0, 300)}`,
  );
}

/** Convenience for callers/tests that expect exactly one decision. */
export function parseDecisionJson(text: string): RawDecision {
  const decisions = parseDecisionsJson(text);
  const first = decisions[0];
  if (!first) throw new Error(`inference returned no decisions | raw: ${text.slice(0, 300)}`);
  return first;
}

function derivedSources(input: CompileInput): string[] {
  const sources = new Set<string>();
  for (const e of input.events) {
    if (e.sessionId) sources.add(e.sessionId);
    if (e.commit) sources.add(e.commit.slice(0, 8));
  }
  return [...sources];
}

function buildBody(opts: {
  id: string;
  title: string;
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string;
  sources: string[];
  supersedes?: string;
}): string {
  const alts =
    opts.alternatives.length > 0
      ? opts.alternatives.map((a) => `- ${a}`).join("\n")
      : "- (no alternatives were recorded in the captured events)";
  const sections = [
    `# ${opts.id}: ${opts.title}`,
    "",
    "## Context",
    "",
    opts.context || "(not captured)",
    "",
    "## Decision",
    "",
    opts.decision || "(not captured)",
    "",
    "## Alternatives considered",
    "",
    alts,
    "",
    "## Consequences",
    "",
    opts.consequences || "(not captured)",
  ];
  if (opts.supersedes) {
    sections.push("", "## Supersedes", "", opts.supersedes);
  }
  sections.push("", `<!-- SOURCES: ${opts.sources.join(", ") || "none"} -->`);
  return sections.join("\n");
}

function defaultInfer(config: LoreConfig): InferenceFn {
  return (prompt, repoRoot) => {
    const args = ["-p", prompt, "--cwd", repoRoot];
    if (config.inference.thinking) args.push("--thinking", config.inference.thinking);
    if (config.inference.model) args.push("-m", config.inference.model);

    // A filesystem lock marks "Lore is asking Cline to think right now". Cline may
    // run plugins in a sandbox that does not inherit our env vars, so the lock file
    // (not LORE_INTERNAL alone) is what reliably stops the capture plugin from
    // recording the events of our own compilation - a runaway feedback loop.
    const lockDir = join(repoRoot, ".lore", "meta");
    const lock = join(lockDir, "inference.lock");
    try {
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(lock, String(Date.now()), "utf8");
    } catch {
      // best effort; env var below is the fallback signal
    }

    try {
      return execFileSync("cline", args, {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 300_000,
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, LORE_INTERNAL: "1" },
      });
    } finally {
      try {
        unlinkSync(lock);
      } catch {
        // already gone
      }
    }
  };
}

export function createClineCompiler(config: LoreConfig, options: CompilerOptions = {}): Compiler {
  const infer = options.infer ?? defaultInfer(config);
  const now = options.now ?? (() => new Date());

  return {
    async compile(input: CompileInput): Promise<CompileResult[]> {
      if (input.events.length === 0) throw new Error("nothing to compile: no events");

      const transcript = renderTranscript(input.events);
      const existing = input.existing ?? [];
      const decisions = parseDecisionsJson(
        infer(buildPrompt(transcript, existing, input.reason), input.repoRoot),
      );

      // No architectural reasoning in the events -> record nothing (never spam the wiki).
      if (decisions.length === 0) return [];

      const maxExisting = Math.max(0, ...existing.map((a) => numericId(a.id)));

      return decisions.slice(0, 3).map((raw, index) => {
        const id = padId(maxExisting + index + 1);
        const confidenceRaw = Number(raw.confidence);
        const confidence = Number.isFinite(confidenceRaw)
          ? Math.min(1, Math.max(0, confidenceRaw))
          : 0.5;
        const route: "wiki" | "drafts" =
          config.autonomy === "auto" && confidence >= config.confidenceThreshold ? "wiki" : "drafts";
        const sources = [...new Set([...asStringArray(raw.sources), ...derivedSources(input)])];
        const title = asString(raw.title, "Untitled decision");
        const body = buildBody({
          id,
          title,
          context: asString(raw.context),
          decision: asString(raw.decision),
          alternatives: asStringArray(raw.alternatives),
          consequences: asString(raw.consequences),
          sources,
          supersedes: asString(raw.supersedes),
        });

        const adr: Adr = {
          frontmatter: {
            id,
            title,
            status: route === "wiki" ? "accepted" : "draft",
            date: now().toISOString().slice(0, 10),
            confidence,
            sources,
            tags: asStringArray(raw.tags),
          },
          body,
        };

        return { adr, confidence, route };
      });
    },
  };
}
