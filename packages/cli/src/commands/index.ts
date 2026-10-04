/**
 * `lore index` - regenerate the markdown index and the SQLite FTS search index.
 *
 * Indexes are read-time artefacts: nothing is rewritten per ADR write, so this is
 * the command you run after a batch of changes (or in CI, before deploying docs).
 */
import { createStore } from "@lore/core";

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
