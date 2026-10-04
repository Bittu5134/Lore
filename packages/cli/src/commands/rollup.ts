/**
 * @fileoverview `lore rollup` Command Implementation.
 *
 * @description
 * Implements hierarchical architectural synthesis for repository scaling.
 *
 * Instead of retaining hundreds of fine-grained granular ADRs forever, `lore rollup`
 * distils a month or era of individual decisions into a unified "Theme ADR".
 *
 * Execution Modes:
 *  - Default Dry Run: Prints proposed synthesized themes without modifying the disk.
 *  - Persisted Mode (`--write`): Records the synthesized Theme ADR into the wiki and updates indexes.
 *  - Month Filter (`--month YYYY-MM`): Restricts synthesis to a specific calendar month.
 */

import { createClineCompiler, createStore, type LoreEvent } from "@lore/core";

/**
 * Executes the `lore rollup` command.
 *
 * @param args Command line arguments (`--month YYYY-MM`, `--write`).
 */
export async function run(args: string[]): Promise<void> {
  const write = args.includes("--write");
  const monthIndex = args.indexOf("--month");
  const month = monthIndex !== -1 ? args[monthIndex + 1] : undefined;

  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    process.stderr.write("usage: lore rollup [--month YYYY-MM] [--write]\n");
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const store = createStore(root);
  const adrs = [...store.listAdrs("wiki"), ...store.listAdrs("drafts")].filter(
    (adr) => !month || adr.date.startsWith(month),
  );

  if (adrs.length === 0) {
    process.stdout.write(
      month ? `lore: no ADRs dated ${month}\n` : "lore: the wiki is empty - nothing to roll up\n",
    );
    return;
  }

  // The ADRs themselves form the synthesized evidence payload.
  const events: LoreEvent[] = adrs.map((adr) => ({
    ts: `${adr.date}T00:00:00.000Z`,
    source: "manual",
    kind: "manual_note",
    payload: {
      text: `[${adr.id}] ${adr.title}\n\n${(store.readAdr(adr.id)?.body ?? "").slice(0, 1200)}`,
      rollup: true,
    },
  }));

  process.stdout.write(
    `lore: rolling up ${adrs.length} ADR(s)${month ? ` from ${month}` : ""}` +
      `${write ? "" : " (dry run - pass --write to save)"}...\n`,
  );

  const compiler = createClineCompiler(store.readConfig());
  const results = await compiler.compile({
    events,
    repoRoot: root,
    existing: store.allAdrFrontmatter(),
    reason: `rollup of ${adrs.length} ADRs${month ? ` in ${month}` : ""}`,
  });

  if (results.length === 0) {
    process.stdout.write("lore: no overarching theme found (nothing recorded)\n");
    return;
  }

  for (const result of results) {
    if (!write) {
      process.stdout.write(`  would record: ${result.adr.frontmatter.title} (confidence ${result.confidence.toFixed(2)})\n`);
      continue;
    }
    const written = store.writeAdr(result);
    process.stdout.write(`  ${written.id} (confidence ${result.confidence.toFixed(2)}) -> ${written.path}\n`);
  }

  if (write) {
    store.regenerateIndex();
    process.stdout.write("lore: rollup written - link it back with `lore supersede <id> --by <rollup-id>` if it replaces older ADRs\n");
  }
}
