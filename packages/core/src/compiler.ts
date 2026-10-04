/**
 * The ADR compiler: turn captured events into one architectural decision record.
 *
 * Inference shells out to `cline -p` (reusing the user's existing Cline auth),
 * but is injectable so tests never touch the network.
 */
import { execFileSync } from "node:child_process";
import type { Adr, CompileInput, CompileResult, Compiler, LoreConfig } from "./types.ts";
import { numericId, padId } from "./adr.ts";
import { renderTranscript } from "./events.ts";

export type InferenceFn = (prompt: string, repoRoot: string) => string;

export interface CompilerOptions {
  /** Injected inference - defaults to `cline -p`. Tests pass a fake. */
  infer?: InferenceFn;
  /** Clock injection for deterministic dates. */
  now?: () => Date;
}

export const DECISION_JSON_SHAPE = `{"title": string, "context": string, "decision": string, "alternatives": string[], "consequences": string, "confidence": number, "tags": string[], "sources": string[]}`;

const PROMPT_HEADER = [
  "You are Lore, an architectural-decision recorder.",
  "Below are events captured from a development session (an AI agent's reasoning and tool use, and/or git commits).",
  "Distil them into ONE architectural decision record that captures the WHY: the context that forced a decision,",
  "the decision itself, and the alternatives that were considered and rejected.",
  "",
  "Rules:",
  "- Base every claim on the events. Never invent facts. If the evidence is thin, lower your confidence.",
  '- "alternatives" lists options that were considered or implied and NOT chosen, with the reason.',
  "- confidence is 0..1: how certain you are that this ADR faithfully captures the reasoning.",
  "- Prefer a specific, imperative title.",
  "",
  "Respond with a single JSON object and NOTHING else (no prose, no fences):",
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
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter((v) => v !== "");
}

export function buildPrompt(transcript: string, reason?: string): string {
  const header = reason ? `${PROMPT_HEADER}\n\nTrigger: ${reason}` : PROMPT_HEADER;
  return `${header}\n\nEVENTS CAPTURED:\n${transcript.slice(0, 12000)}`;
}

export function parseDecisionJson(text: string): RawDecision {
  const withoutFences = text.replace(/```json/gi, "```").replace(/```/g, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`inference did not return JSON (got: ${text.slice(0, 160)})`);
  }
  const parsed = JSON.parse(withoutFences.slice(start, end + 1)) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("inference JSON was not an object");
  }
  return parsed as RawDecision;
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
}): string {
  const alts =
    opts.alternatives.length > 0
      ? opts.alternatives.map((a) => `- ${a}`).join("\n")
      : "- (no alternatives were recorded in the captured events)";
  return [
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
    "",
    `<!-- SOURCES: ${opts.sources.join(", ") || "none"} -->`,
  ].join("\n");
}

function defaultInfer(config: LoreConfig): InferenceFn {
  return (prompt, repoRoot) => {
    const args = ["-p", prompt, "--cwd", repoRoot];
    if (config.inference.thinking) args.push("--thinking", config.inference.thinking);
    if (config.inference.model) args.push("-m", config.inference.model);
    return execFileSync("cline", args, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  };
}

export function createClineCompiler(config: LoreConfig, options: CompilerOptions = {}): Compiler {
  const infer = options.infer ?? defaultInfer(config);
  const now = options.now ?? (() => new Date());

  return {
    async compile(input: CompileInput): Promise<CompileResult> {
      if (input.events.length === 0) throw new Error("nothing to compile: no events");

      const transcript = renderTranscript(input.events);
      const raw = parseDecisionJson(infer(buildPrompt(transcript, input.reason), input.repoRoot));

      const maxExisting = Math.max(0, ...(input.existing ?? []).map((a) => numericId(a.id)));
      const id = padId(maxExisting + 1);

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
    },
  };
}
