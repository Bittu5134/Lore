/**
 * @fileoverview SQLite FTS5 Full-Text Search Engine for Lore ADRs.
 *
 * @description
 * Implements high-speed, indexed full-text search across the Lore knowledge wiki using
 * Node.js's built-in `node:sqlite` module (introduced in Node 22+).
 *
 * Design Invariants:
 *  - Graceful Degradation: If `node:sqlite` or the FTS5 extension is unavailable on the
 *    host platform, search entry points cleanly return `null` so the caller automatically
 *    falls back to the robust in-memory linear scanner without throwing errors.
 *  - On-Demand Refresh: The virtual table is refreshed during indexing and re-indexed
 *    without locking out concurrent readers.
 *  - BM25 Scoring: Ranks matches using SQLite's BM25 algorithm and extracts highlighted
 *    snippets with custom delimiters (`[`, `]`).
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LORE_PATHS, type AdrFrontmatter, type SearchHit } from "./types.ts";

/**
 * Structural interface defining store capabilities required by the search indexer.
 * Decouples `search.ts` from `store.ts` to eliminate circular dependency hazards.
 */
export interface SearchSource {
  /** Repository root directory path. */
  root: string;
  /** Lists ADR frontmatter metadata from wiki and/or drafts. */
  listAdrs(dir?: "wiki" | "drafts"): AdrFrontmatter[];
  /** Reads the full content of an ADR by ID. */
  readAdr(id: string): { frontmatter: AdrFrontmatter; body: string } | null;
}

/**
 * Minimal interface representing the synchronous SQLite database connection.
 */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
}

/**
 * Returns the absolute path to the SQLite search database on disk.
 *
 * @param root Repository root directory.
 * @returns Absolute path to `.lore/meta/search.db`.
 */
function dbPath(root: string): string {
  return join(root, LORE_PATHS.meta, "search.db");
}

/**
 * Attempts to dynamically import `node:sqlite` and open the local search database.
 * Returns `null` if the native module is unavailable.
 *
 * @param root Repository root directory.
 * @returns Connected SqliteDb instance or null.
 */
async function openDb(root: string): Promise<SqliteDb | null> {
  try {
    const mod = (await import("node:sqlite")) as { DatabaseSync: new (p: string) => SqliteDb };
    mkdirSync(join(root, LORE_PATHS.meta), { recursive: true });
    return new mod.DatabaseSync(dbPath(root));
  } catch {
    return null;
  }
}

/**
 * Builds or refreshes the SQLite FTS5 full-text search index from all wiki and draft ADRs.
 *
 * This operation is idempotent and never throws; if SQLite or FTS5 is unsupported,
 * it returns `{ ok: false, reason: "..." }`.
 *
 * @param source Store interface providing access to ADRs.
 * @returns Status object detailing success status, indexed document count, or failure reason.
 */
export async function buildFtsIndex(
  source: SearchSource,
): Promise<{ ok: boolean; count?: number; reason?: string }> {
  const db = await openDb(source.root);
  if (!db) return { ok: false, reason: "node:sqlite unavailable (needs Node 22+)" };

  try {
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS adr USING fts5(id UNINDEXED, title, body)");
    db.exec("DELETE FROM adr");
    const insert = db.prepare("INSERT INTO adr (id, title, body) VALUES (?, ?, ?)");
    let count = 0;
    for (const frontmatter of source.listAdrs("wiki").concat(source.listAdrs("drafts"))) {
      const adr = source.readAdr(frontmatter.id);
      if (!adr) continue;
      insert.run(adr.frontmatter.id, adr.frontmatter.title, adr.body);
      count += 1;
    }
    db.close();
    return { ok: true, count };
  } catch (err) {
    try {
      db.close();
    } catch {
      // already closed
    }
    return { ok: false, reason: (err as Error).message };
  }
}

/**
 * Executes a full-text query against the SQLite FTS5 virtual table.
 *
 * @param source Store interface providing filesystem paths.
 * @param query Space-separated keyword string (e.g., "sqlite search performance").
 * @param limit Maximum number of search results to return.
 * @returns Array of scored `SearchHit` objects, or `null` if the FTS index does not exist or fails.
 */
export async function searchFts(
  source: SearchSource,
  query: string,
  limit: number,
): Promise<SearchHit[] | null> {
  if (!existsSync(dbPath(source.root))) return null;
  const db = await openDb(source.root);
  if (!db) return null;

  try {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .map((t) => t.replace(/["*]/g, ""));
    if (terms.length === 0) return [];
    const match = terms.map((t) => `"${t}"`).join(" OR ");

    const rows = db.prepare(
      "SELECT id, title, snippet(adr, 2, '[', ']', ' … ', 12) AS snip, bm25(adr) AS score " +
        "FROM adr WHERE adr MATCH ? ORDER BY score LIMIT ?",
    ).all(match, limit) as Array<{ id: string; title: string; snip: string; score: number }>;
    db.close();

    return rows.map((row) => ({
      adrId: String(row.id),
      title: String(row.title),
      snippet: String(row.snip ?? "").replace(/\s+/g, " ").trim(),
      // bm25() returns lower = better; invert so callers can sort descending (higher = better)
      score: Number.isFinite(Number(row.score)) ? 1 / (1 + Math.abs(Number(row.score))) : 1,
    }));
  } catch {
    try {
      db.close();
    } catch {
      // already closed
    }
    return null;
  }
}
