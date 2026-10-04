/**
 * `lore review` - triage drafts into the accepted wiki.
 *
 *   lore review              list drafts awaiting review
 *   lore review ADR-0007     promote one
 *   lore review --all        promote every draft
 */
import { createStore } from "@lore/core";

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
