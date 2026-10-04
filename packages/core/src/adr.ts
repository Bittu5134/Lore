/**
 * @fileoverview ADR (Architecture Decision Record) Markdown Serializer & Parser.
 *
 * @description
 * Handles zero-dependency parsing and rendering of Markdown documents with YAML
 * frontmatter. Avoids third-party YAML dependencies to guarantee portability,
 * rapid startup time, and deterministic serialisation across all platforms.
 *
 * Each ADR consists of:
 * 1. YAML frontmatter bracketed by `---` containing structured metadata
 *    (`id`, `title`, `status`, `date`, `confidence`, `sources`, `tags`).
 * 2. Markdown body containing the standardized architectural sections:
 *    - Context
 *    - Decision
 *    - Alternatives considered
 *    - Consequences
 */

import type { Adr, AdrFrontmatter, AdrStatus } from "./types.ts";

/**
 * Formats a numeric identifier into a canonical zero-padded ADR string.
 *
 * @example
 * padId(1) // returns "ADR-0001"
 * padId(42) // returns "ADR-0042"
 *
 * @param n Positive integer representing the decision sequence number.
 * @returns Canonical ADR identifier formatted as `ADR-NNNN`.
 */
export function padId(n: number): string {
  return `ADR-${String(n).padStart(4, "0")}`;
}

/**
 * Extracts the numeric sequence value from an ADR string identifier.
 *
 * @example
 * numericId("ADR-0007") // returns 7
 * numericId("invalid")  // returns 0
 *
 * @param id The ADR identifier string to parse.
 * @returns Parsed integer value, or 0 if format is unrecognised.
 */
export function numericId(id: string): number {
  const m = /ADR-(\d+)/.exec(id);
  return m ? Number.parseInt(m[1] ?? "0", 10) : 0;
}

/**
 * Generates a filesystem-friendly URL slug from an arbitrary title string.
 *
 * Transforms text to lowercase, replaces non-alphanumeric characters with hyphens,
 * trims leading/trailing hyphens, and truncates to a maximum of 60 characters.
 *
 * @example
 * slugify("Use SQLite FTS5 for search!") // returns "use-sqlite-fts5-for-search"
 *
 * @param title Raw title text.
 * @returns Clean, alphanumeric kebab-cased slug.
 */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

/**
 * Constructs the canonical filename for an ADR markdown document on disk.
 * Combines the ADR id and the title slug.
 *
 * @example
 * formatAdrFilename({ frontmatter: { id: "ADR-0003", title: "Resolve ID Collisions", ... }, body: "" })
 * // returns "ADR-0003-resolve-id-collisions.md"
 *
 * @param adr The ADR instance.
 * @returns Filename string ending in `.md`.
 */
export function formatAdrFilename(adr: Adr): string {
  return `${adr.frontmatter.id}-${slugify(adr.frontmatter.title)}.md`;
}

/** Allowed ADR lifecycle statuses. */
const STATUSES: ReadonlySet<string> = new Set(["accepted", "draft", "superseded"]);

/**
 * Helper to render an array of strings into YAML list syntax.
 *
 * @param key The YAML property name.
 * @param values Array of string values.
 * @returns Lines formatted as YAML property and items.
 */
function renderList(key: string, values: string[]): string[] {
  const out = [`${key}:`];
  for (const v of values) out.push(`  - ${v}`);
  return out;
}

/**
 * Serializes an in-memory `Adr` object into a standardized Markdown string with
 * YAML frontmatter.
 *
 * @param adr The ADR object to render.
 * @returns Valid Markdown document ready for disk storage or display.
 */
export function renderAdr(adr: Adr): string {
  const f = adr.frontmatter;
  const lines = [
    "---",
    `id: ${f.id}`,
    `title: ${f.title}`,
    `status: ${f.status}`,
    `date: ${f.date}`,
    `confidence: ${f.confidence}`,
    ...renderList("sources", f.sources),
    ...renderList("tags", f.tags),
    "---",
    "",
    adr.body.trim(),
    "",
  ];
  return lines.join("\n");
}

/**
 * Parses a raw Markdown document string into an `Adr` structure, extracting YAML
 * frontmatter scalars and lists without external parser dependencies.
 *
 * @throws {Error} If the Markdown document lacks leading `---` frontmatter markers.
 *
 * @param markdown Raw Markdown text read from disk.
 * @returns Parsed `Adr` containing structured frontmatter and the markdown body.
 */
export function parseAdr(markdown: string): Adr {
  const text = markdown.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) throw new Error("ADR is missing YAML frontmatter");

  const raw = match[1] ?? "";
  const body = text.slice(match[0].length).replace(/^\n+/, "");

  const scalars = new Map<string, string>();
  const lists = new Map<string, string[]>();
  let listKey: string | null = null;

  for (const line of raw.split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      lists.get(listKey)?.push(item[1]?.trim() ?? "");
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1] ?? "";
    const value = kv[2] ?? "";
    if (value === "") {
      listKey = key;
      if (!lists.has(key)) lists.set(key, []);
    } else {
      listKey = null;
      scalars.set(key, value.trim());
    }
  }

  const id = scalars.get("id") ?? "ADR-0000";
  const statusRaw = scalars.get("status") ?? "draft";
  const confidence = Number.parseFloat(scalars.get("confidence") ?? "0");

  const frontmatter: AdrFrontmatter = {
    id,
    title: scalars.get("title") ?? "Untitled",
    status: (STATUSES.has(statusRaw) ? statusRaw : "draft") as AdrStatus,
    date: scalars.get("date") ?? new Date().toISOString().slice(0, 10),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    sources: lists.get("sources") ?? [],
    tags: lists.get("tags") ?? [],
  };

  return { frontmatter, body };
}
