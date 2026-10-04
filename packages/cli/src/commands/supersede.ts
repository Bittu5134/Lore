/**
 * `lore supersede <id> [--by <id>]` - retire a decision.
 *
 * Keeps the history navigable: the old ADR stays, marked `superseded`, ideally
 * pointing at the ADR that replaced it.
 */
import { createStore } from "@lore/core";

export async function run(args: string[]): Promise<void> {
  const store = createStore(process.cwd());
  const byIndex = args.indexOf("--by");
  const by = byIndex !== -1 ? args[byIndex + 1] : undefined;

  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--by") {
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) positional.push(arg);
  }
  const id = positional[0];

  if (!id) {
    process.stderr.write("usage: lore supersede <ADR-id> [--by <ADR-id>]\n");
    process.exitCode = 1;
    return;
  }
  if (by && !store.readAdr(by)) {
    process.stderr.write(`lore: no ADR matching "--by ${by}"\n`);
    process.exitCode = 1;
    return;
  }
  if (!store.supersedeAdr(id, by)) {
    process.stderr.write(`lore: no ADR matching "${id}"\n`);
    process.exitCode = 1;
    return;
  }

  store.regenerateIndex();
  process.stdout.write(`lore: ${id} marked superseded${by ? ` by ${by}` : ""}\n`);
}
