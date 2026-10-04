/**
 * Optional SQLite FTS5 full-text index over the wiki.
 *
 * `node:sqlite` ships with Node 22+; FTS5 support depends on the bundled SQLite
 * build (present on Node 26, may need `--experimental-sqlite` on early 22.x).
 * Every entry point degrades gracefully: if anything is unavailable, callers
 * fall back to the plain linear scan, which is correct - just slower.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LORE_PATHS, type AdrFrontmatter, type SearchHit } from "./types.ts";

/** Structural view of the store the index needs (avoids an import cycle). */
export interface SearchSource {
  root: string;
  listAdrs(dir?: "wiki" | "drafts"): AdrFrontmatter[];
  readAdr(id: string): { frontmatter: AdrFrontmatter; body: string } | null;
}

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
}

function dbPath(root: string): string {
  return join(root, LORE_PATHS.meta, "search.db");
}

async function openDb(root: string): Promise<SqliteDb | null> {
  try {
    const mod = (await import("node:sqlite")) as { DatabaseSync: new (p: string) => SqliteDb };
    mkdirSync(join(root, LORE_PATHS.meta), { recursive: true });
    return new mod.DatabaseSync(dbPath(root));
  } catch {
    return null;
  }
}

/** Build/refresh the FTS index. Returns ok:false (never throws) when unavailable. */
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

/** Query the FTS index. Returns null when there is no usable index. */
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
      // bm25() returns lower = better; invert so callers can sort desc
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
