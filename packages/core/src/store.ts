/**
 * The .lore store: durable paths, cursor state, the raw event log and the wiki.
 * All capture lanes and the MCP server read/write through this.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
} from "./types.ts";
import { formatAdrFilename, numericId, padId, parseAdr, renderAdr } from "./adr.ts";
import { parseEventsJsonl, serializeEvent, sortEvents } from "./events.ts";

export interface SearchHit {
  adrId: string;
  title: string;
  snippet: string;
  score: number;
}

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
  searchAdrs(query: string, limit?: number): SearchHit[];
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
      const target = file ?? SOURCE_FILE[event.source] ?? "events.jsonl";
      const bucket = byFile.get(target);
      if (bucket) bucket.push(event);
      else byFile.set(target, [event]);
    }
    for (const [target, bucket] of byFile) {
      appendFileSync(abs(join(LORE_PATHS.raw, target)), bucket.map((e) => `${serializeEvent(e)}\n`).join(""), "utf8");
    }
  }

  function readEvents(options?: { since?: string }): LoreEvent[] {
    const rawDir = abs(LORE_PATHS.raw);
    if (!existsSync(rawDir)) return [];
    const events: LoreEvent[] = [];
    for (const file of readdirSync(rawDir)) {
      if (!file.endsWith(".jsonl")) continue;
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
    regenerateIndex();
    return { id: adr.frontmatter.id, path: rel };
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
    searchAdrs,
    regenerateIndex,
  };
}
