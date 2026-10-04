/**
 * @fileoverview `lore index` Command Implementation.
 *
 * @description
 * Re-indexes the entire repository knowledge base:
 * 1. Markdown Index: Re-renders `.lore/wiki/index.md` listing all accepted decisions and pending drafts.
 * 2. SQLite FTS5 Index: Rebuilds `.lore/meta/search.db` to accelerate keyword and semantic retrieval.
 *
 * Architectural Invariant:
 * Indexes are treated as read-time acceleration artifacts. Rebuilding them is fully
 * idempotent and safe to execute during continuous integration or docs deployment.
 */

import { createStore } from "@lore/core";

/**
 * Executes the `lore index` command.
 *
 * @param _args Command line argument vector.
 */
export async function run(_args: string[]): Promise<void> {
  const store = createStore(process.cwd());
  store.regenerateIndex();

  const total = store.listAdrs("wiki").length + store.listAdrs("drafts").length;
  process.stdout.write(`lore: wiki/index.md regenerated (${total} ADR(s))\n`);

  const fts = await store.buildSearchIndex();
  if (fts.ok) {
    process.stdout.write(`lore: search index built (${fts.count} ADR(s) -> .lore/meta/search.db)\n`);
  } else {
    process.stdout.write(
      `lore: search index skipped - ${fts.reason}\n` +
        `      (search still works via the linear scan; build with a newer Node to speed it up)\n`,
    );
  }
}
