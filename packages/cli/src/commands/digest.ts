/**
 * @fileoverview `lore digest` Command Implementation.
 *
 * @description
 * Generates an executive Markdown summary of recent architectural decisions.
 * Designed for automated integration into Pull Request comments, developer newsletters,
 * and release notes.
 *
 * Usage:
 *  `lore digest [--limit <count>]`
 */

import { createStore } from "@lore/core";

/**
 * Executes the `lore digest` command.
 *
 * @param args Command line arguments (`--limit <N>`).
 */
export async function run(args: string[]): Promise<void> {
  const store = createStore(process.cwd());
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex !== -1 ? Number(args[limitIndex + 1]) || 10 : 10;

  const all = [...store.listAdrs("wiki"), ...store.listAdrs("drafts")].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );

  if (all.length === 0) {
    process.stdout.write("## Lore — recent decisions\n\n_No decisions recorded yet._\n");
    return;
  }

  const shown = all.slice(0, limit);
  const lines = ["## Lore — recent decisions", ""];
  for (const adr of shown) {
    const flag = adr.status === "accepted" ? "" : ` _( ${adr.status} )_`;
    lines.push(`- **${adr.id}** ${adr.title}${flag}`);
  }
  lines.push("", `_${shown.length} of ${all.length} ADRs — see \`.lore/wiki/\`._`);
  process.stdout.write(`${lines.join("\n")}\n`);
}
