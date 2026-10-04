/**
 * @fileoverview Lore On-Disk Storage Engine & Repository Knowledge Store.
 *
 * @description
 * Implements the centralized `.lore/` persistence engine managing:
 *  - On-disk folder hierarchy (`config.json`, `hooks/`, `raw/`, `wiki/`, `drafts/`, `meta/`)
 *  - Month-partitioned JSONL telemetry event logging (`raw/YYYY-MM-*.jsonl`)
 *  - State cursors for incremental synchronization (`meta/state.json`)
 *  - ADR markdown read, write, draft promotion, and supersession updates
 *  - Real-time catalog generation (`wiki/index.md`)
 *  - Dual-mode search: indexed SQLite FTS5 with automatic linear scan fallback
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  DEFAULT_STATE,
  LORE_PATHS,
  type Adr,
  type AdrFrontmatter,
  type CompileResult,
  type LoreConfig,
  type LoreEvent,
  type LoreSource,
  type LoreState,
  type SearchHit,
} from "./types.ts";
import { formatAdrFilename, numericId, padId, parseAdr, renderAdr } from "./adr.ts";
import { parseEventsJsonl, serializeEvent, sortEvents } from "./events.ts";
import { buildFtsIndex, searchFts } from "./search.ts";
import { redactValue } from "./redact.ts";

export interface LoreStore {
  readonly root: string;
  init(): void;
  readConfig(): LoreConfig;
  writeConfig(config: LoreConfig): void;
  readState(): LoreState;
  writeState(state: LoreState): void;
  appendEvents(events: LoreEvent[], file?: string): void;
  readEvents(options?: { since?: string }): LoreEvent[];
  listAdrFiles(dir?: "wiki" | "drafts"): string[];
  listAdrs(dir?: "wiki" | "drafts"): AdrFrontmatter[];
  /** Accepted + draft ADR frontmatter, ready to feed the compiler's `existing`. */
  allAdrFrontmatter(): AdrFrontmatter[];
  readAdr(id: string): Adr | null;
  writeAdr(result: CompileResult): { id: string; path: string };
  /** Promote a draft ADR into the accepted wiki. */
  promoteAdr(id: string): { ok: boolean; path?: string; reason?: string };
  /** Mark an ADR superseded, optionally pointing at the ADR that replaced it. */
  supersedeAdr(id: string, byId?: string): boolean;
  /** Where an ADR currently lives (used by the lifecycle commands). */
  findAdr(id: string): { dir: "wiki" | "drafts"; rel: string } | null;
  searchAdrs(query: string, limit?: number): SearchHit[];
  /** Like searchAdrs, but uses the SQLite FTS index when one has been built. */
  searchAdrsAsync(query: string, limit?: number): Promise<SearchHit[]>;
  /** Build/refresh the SQLite FTS index. Never throws; returns why it failed. */
  buildSearchIndex(): Promise<{ ok: boolean; count?: number; reason?: string }>;
  regenerateIndex(): void;
}

const INDEX_FILE = "index.md";
const TEMPLATE_FILE = "ADR-0000-template.md";
const SOURCE_FILE: Record<LoreSource, string> = {
  "cline-session": "session.jsonl",
  "git-commit": "commits.jsonl",
  "fs-session": "fs.jsonl",
  manual: "manual.jsonl",
};

const ADR_TEMPLATE = `---
id: ADR-0000
title: ADR title (imperative, specific)
status: draft
date: YYYY-MM-DD
confidence: 0.0
sources: []
tags: []
---

# ADR-0000: <title>

## Context

What situation forced a decision? What constraints existed?

## Decision

What was chosen, stated plainly.

## Alternatives considered

- **<alternative>** — why it was rejected.

## Consequences

What becomes easier, what becomes harder, what is now assumed.
`;

export function createStore(root: string): LoreStore {
  const abs = (relative: string): string => join(root, relative);

  function readConfig(): LoreConfig {
    try {
      return { ...DEFAULT_CONFIG, ...(JSON.parse(readFileSync(abs(LORE_PATHS.config), "utf8")) as LoreConfig) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function writeConfig(config: LoreConfig): void {
    mkdirSync(abs(LORE_PATHS.meta), { recursive: true });
    writeFileSync(abs(LORE_PATHS.config), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  function readState(): LoreState {
    try {
      return { ...DEFAULT_STATE, ...(JSON.parse(readFileSync(abs(LORE_PATHS.state), "utf8")) as LoreState) };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function writeState(state: LoreState): void {
    mkdirSync(abs(LORE_PATHS.meta), { recursive: true });
    writeFileSync(abs(LORE_PATHS.state), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  function init(): void {
    for (const dir of [LORE_PATHS.raw, LORE_PATHS.wiki, LORE_PATHS.drafts, LORE_PATHS.meta, LORE_PATHS.hooks]) {
      mkdirSync(abs(dir), { recursive: true });
    }
    if (!existsSync(abs(LORE_PATHS.config))) writeConfig(DEFAULT_CONFIG);
    if (!existsSync(abs(LORE_PATHS.state))) writeState(DEFAULT_STATE);
    const templatePath = abs(join(LORE_PATHS.wiki, TEMPLATE_FILE));
    if (!existsSync(templatePath)) writeFileSync(templatePath, ADR_TEMPLATE, "utf8");
    regenerateIndex();
  }

  function appendEvents(events: LoreEvent[], file?: string): void {
    mkdirSync(abs(LORE_PATHS.raw), { recursive: true });
    const byFile = new Map<string, LoreEvent[]>();
    for (const event of events) {
      // Partition by month (raw/YYYY-MM-<source>.jsonl) so a cursor can skip whole
      // months instead of reading the whole history back.
      const source = SOURCE_FILE[event.source] ?? "events.jsonl";
      const target = file ?? `${event.ts.slice(0, 7)}-${source}`;
      // Redact before anything touches disk: secrets must never reach raw/.
      const safe: LoreEvent = { ...event, payload: redactValue(event.payload) as LoreEvent["payload"] };
      const bucket = byFile.get(target);
      if (bucket) bucket.push(safe);
      else byFile.set(target, [safe]);
    }
    for (const [target, bucket] of byFile) {
      appendFileSync(abs(join(LORE_PATHS.raw, target)), bucket.map((e) => `${serializeEvent(e)}\n`).join(""), "utf8");
    }
  }

  function readEvents(options?: { since?: string }): LoreEvent[] {
    const rawDir = abs(LORE_PATHS.raw);
    if (!existsSync(rawDir)) return [];

    // Partition files are named YYYY-MM-<source>.jsonl, so a cursor lets us skip
    // entire months instead of parsing the whole history (see docs/scaling.md).
    // Un-prefixed files (e.g. cli-hooks.jsonl) are always read - they stay small.
    const sinceMonth = options?.since ? options.since.slice(0, 7) : undefined;

    const events: LoreEvent[] = [];
    for (const file of readdirSync(rawDir)) {
      if (!file.endsWith(".jsonl")) continue;
      const month = /^(\d{4}-\d{2})-/.exec(file)?.[1];
      if (month && sinceMonth && month < sinceMonth) continue;
      events.push(...parseEventsJsonl(readFileSync(join(rawDir, file), "utf8")));
    }
    const sorted = sortEvents(events);
    return options?.since ? sorted.filter((e) => e.ts > options.since!) : sorted;
  }

  function dirRel(dir: "wiki" | "drafts"): string {
    return dir === "wiki" ? LORE_PATHS.wiki : LORE_PATHS.drafts;
  }

  function listAdrFiles(dir: "wiki" | "drafts" = "wiki"): string[] {
    const base = abs(dirRel(dir));
    if (!existsSync(base)) return [];
    return readdirSync(base)
      .filter((f) => f.endsWith(".md") && f !== INDEX_FILE && f !== TEMPLATE_FILE)
      .sort();
  }

  function listAdrs(dir: "wiki" | "drafts" = "wiki"): AdrFrontmatter[] {
    const out: AdrFrontmatter[] = [];
    for (const file of listAdrFiles(dir)) {
      try {
        out.push(parseAdr(readFileSync(abs(join(dirRel(dir), file)), "utf8")).frontmatter);
      } catch {
        // skip malformed pages rather than failing the whole listing
      }
    }
    return out;
  }

  function allAdrFrontmatter(): AdrFrontmatter[] {
    return [...listAdrs("wiki"), ...listAdrs("drafts")];
  }

  function readAdr(id: string): Adr | null {
    for (const dir of ["wiki", "drafts"] as const) {
      for (const file of listAdrFiles(dir)) {
        if (!file.startsWith(id)) continue;
        try {
          return parseAdr(readFileSync(abs(join(dirRel(dir), file)), "utf8"));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  function writeAdr(result: CompileResult): { id: string; path: string } {
    // Resolve id collisions (concurrent writers, e.g. the post-commit hook
    // overlapping a manual `lore sync`) by allocating the next free id.
    const taken = new Set(allAdrFrontmatter().map((a) => a.id));
    let adr = result.adr;
    if (taken.has(adr.frontmatter.id)) {
      let n = numericId(adr.frontmatter.id);
      while (taken.has(padId(n))) n += 1;
      const newId = padId(n);
      adr = {
        ...adr,
        frontmatter: { ...adr.frontmatter, id: newId },
        body: adr.body.replace(`# ${result.adr.frontmatter.id}:`, `# ${newId}:`),
      };
    }

    const rel = join(dirRel(result.route), formatAdrFilename(adr));
    mkdirSync(abs(dirRel(result.route)), { recursive: true });
    writeFileSync(abs(rel), renderAdr(adr), "utf8");
    const state = readState();
    writeState({
      ...state,
      nextAdrId: Math.max(state.nextAdrId, numericId(adr.frontmatter.id) + 1),
    });
    // NOTE: the index is intentionally NOT regenerated per write (O(n) per ADR
    // means O(n^2) across a backfill). Callers regenerate once per run via
    // regenerateIndex(), and `lore index` does it on demand.
    return { id: adr.frontmatter.id, path: rel };
  }

  function findAdr(id: string): { dir: "wiki" | "drafts"; rel: string } | null {
    for (const dir of ["wiki", "drafts"] as const) {
      for (const file of listAdrFiles(dir)) {
        if (file.startsWith(id)) return { dir, rel: join(dirRel(dir), file) };
      }
    }
    return null;
  }

  function promoteAdr(id: string): { ok: boolean; path?: string; reason?: string } {
    const found = findAdr(id);
    if (!found) return { ok: false, reason: `no ADR matching "${id}"` };
    if (found.dir === "wiki") return { ok: true, path: found.rel };

    let adr: Adr;
    try {
      adr = parseAdr(readFileSync(abs(found.rel), "utf8"));
    } catch {
      return { ok: false, reason: `could not parse ${found.rel}` };
    }
    adr.frontmatter.status = "accepted";
    const rel = join(LORE_PATHS.wiki, formatAdrFilename(adr));
    mkdirSync(abs(LORE_PATHS.wiki), { recursive: true });
    writeFileSync(abs(rel), renderAdr(adr), "utf8");
    unlinkSync(abs(found.rel));
    return { ok: true, path: rel };
  }

  function supersedeAdr(id: string, byId?: string): boolean {
    const found = findAdr(id);
    if (!found) return false;
    let adr: Adr;
    try {
      adr = parseAdr(readFileSync(abs(found.rel), "utf8"));
    } catch {
      return false;
    }
    adr.frontmatter.status = "superseded";
    if (!/superseded by/i.test(adr.body)) {
      adr.body = `${adr.body.trimEnd()}\n\n${byId ? `Superseded by ${byId}.` : "Superseded."}`;
    }
    writeFileSync(abs(found.rel), renderAdr(adr), "utf8");
    return true;
  }

  function searchAdrs(query: string, limit = 5): SearchHit[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits: SearchHit[] = [];
    for (const dir of ["wiki", "drafts"] as const) {
      for (const file of listAdrFiles(dir)) {
        let markdown: string;
        try {
          markdown = readFileSync(abs(join(dirRel(dir), file)), "utf8");
        } catch {
          continue;
        }
        let adr: Adr;
        try {
          adr = parseAdr(markdown);
        } catch {
          continue;
        }
        const haystack = markdown.toLowerCase();
        const title = adr.frontmatter.title.toLowerCase();
        let score = 0;
        for (const term of terms) {
          score += haystack.split(term).length - 1;
          score += (title.split(term).length - 1) * 5;
        }
        if (terms.length > 0 && score === 0) continue;
        const bodyLower = adr.body.toLowerCase();
        const firstTerm = terms[0] ?? "";
        const at = firstTerm ? bodyLower.indexOf(firstTerm) : 0;
        const from = Math.max(0, at - 60);
        const snippet = adr.body.slice(from, from + 200).replace(/\s+/g, " ").trim();
        hits.push({ adrId: adr.frontmatter.id, title: adr.frontmatter.title, snippet, score });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async function searchAdrsAsync(query: string, limit = 5): Promise<SearchHit[]> {
    const hits = await searchFts({ root, listAdrs, readAdr }, query, limit);
    return hits ?? searchAdrs(query, limit);
  }

  async function buildSearchIndex(): Promise<{ ok: boolean; count?: number; reason?: string }> {
    return buildFtsIndex({ root, listAdrs, readAdr });
  }

  function regenerateIndex(): void {
    const adrs = listAdrs("wiki");
    const drafts = listAdrs("drafts");
    const rows = adrs.map(
      (a) => `| ${a.id} | ${a.title} | ${a.status} | ${a.confidence.toFixed(2)} |`,
    );
    const content = [
      "# Lore Wiki Index",
      "",
      `_Generated by Lore. ${adrs.length} accepted, ${drafts.length} draft._`,
      "",
      "| ID | Title | Status | Confidence |",
      "|----|-------|--------|------------|",
      ...rows,
      "",
    ].join("\n");
    mkdirSync(abs(LORE_PATHS.wiki), { recursive: true });
    writeFileSync(abs(LORE_PATHS.index), content, "utf8");
  }

  return {
    root,
    init,
    readConfig,
    writeConfig,
    readState,
    writeState,
    appendEvents,
    readEvents,
    listAdrFiles,
    listAdrs,
    allAdrFrontmatter,
    readAdr,
    writeAdr,
    findAdr,
    promoteAdr,
    supersedeAdr,
    searchAdrs,
    searchAdrsAsync,
    buildSearchIndex,
    regenerateIndex,
  };
}
