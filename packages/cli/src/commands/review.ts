/**
 * @fileoverview `lore review` Command Implementation.
 *
 * @description
 * Human-in-the-loop review interface for triaging draft ADRs stored in `.lore/drafts/`.
 *
 * Modes:
 *  - `lore review`: Displays a summary list of all pending drafts with their confidence scores.
 *  - `lore review <ADR-ID>`: Validates and promotes a single draft to accepted status in `.lore/wiki/`.
 *  - `lore review --all`: Promotes all pending drafts in bulk and regenerates `wiki/index.md`.
 */

import { createStore } from "@lore/core";

/**
 * Executes the `lore review` command.
 *
 * @param args Command line arguments (`<id>`, `--all`).
 */
export async function run(args: string[]): Promise<void> {
  const store = createStore(process.cwd());
  const drafts = store.listAdrs("drafts");

  if (drafts.length === 0) {
    process.stdout.write("lore: no drafts awaiting review\n");
    return;
  }

  const all = args.includes("--all");
  const ids = args.filter((a) => !a.startsWith("--"));

  if (!all && ids.length === 0) {
    process.stdout.write(`lore: ${drafts.length} draft(s) awaiting review\n`);
    for (const d of drafts) {
      process.stdout.write(`  ${d.id}  confidence ${d.confidence.toFixed(2)}  ${d.title}\n`);
    }
    process.stdout.write("\n  promote one:  lore review <id>\n  promote all:  lore review --all\n");
    return;
  }

  const targets = all ? drafts.map((d) => d.id) : ids;
  let promoted = 0;
  for (const id of targets) {
    const result = store.promoteAdr(id);
    if (result.ok) {
      promoted += 1;
      process.stdout.write(`  promoted ${id} -> ${result.path}\n`);
    } else {
      process.stderr.write(`  skipped ${id}: ${result.reason}\n`);
    }
  }
  store.regenerateIndex();
  process.stdout.write(`lore: promoted ${promoted} ADR(s)\n`);
}
