/**
 * @fileoverview `lore query` Command Implementation.
 *
 * @description
 * Full-text keyword search and inspection interface for the architectural wiki:
 *  - Accelerated Search: Automatically queries the SQLite FTS5 index (`.lore/meta/search.db`)
 *    when available, gracefully falling back to linear in-memory scan.
 *  - Empty Query: When invoked without arguments (`lore query`), displays an index
 *    listing of all accepted ADRs and drafts.
 *  - Federated Query (`--all`): Interrogates both the local wiki and all foreign repositories
 *    linked via `lore link`.
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { createStore } from "@lore/core";
import { readLinks } from "./link.ts";

/**
 * Executes the `lore query` command.
 *
 * @param args Command line arguments (`<keywords>`, `--all`).
 */
export async function run(args: string[]): Promise<void> {
  const root = process.cwd();
  const store = createStore(root);
  const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  const all = args.includes("--all");

  if (query === "") {
    const adrs = [...store.listAdrs("wiki"), ...store.listAdrs("drafts")];
    if (adrs.length === 0) {
      process.stdout.write("lore: the wiki is empty - run `lore compile` after some activity\n");
      return;
    }
    for (const adr of adrs) {
      process.stdout.write(`${adr.id}  [${adr.status}]  ${adr.title}\n`);
    }
    return;
  }

  const hits = await store.searchAdrsAsync(query, 8);

  if (all) {
    for (const repo of readLinks(root).repos) {
      if (!existsSync(repo)) continue;
      const otherHits = await createStore(repo).searchAdrsAsync(query, 4);
      const label = basename(repo);
      for (const hit of otherHits) {
        hits.push({ ...hit, adrId: `${label}:${hit.adrId}`, title: `[${label}] ${hit.title}` });
      }
    }
  }

  if (hits.length === 0) {
    process.stdout.write(`lore: no ADRs match "${query}"\n`);
    process.exitCode = 1;
    return;
  }
  for (const hit of hits) {
    process.stdout.write(`${hit.adrId}  ${hit.title}\n    ${hit.snippet}\n\n`);
  }
}
