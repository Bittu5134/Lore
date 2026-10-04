/**
 * `lore query <text>` - search the local wiki.
 */
import { createStore } from "@lore/core";

export async function run(args: string[]): Promise<void> {
  const store = createStore(process.cwd());
  const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();

  if (query === "") {
    const adrs = [...store.listAdrs("wiki"), ...store.listAdrs("drafts")];
    if (adrs.length === 0) {
      process.stdout.write("lore: the wiki is empty - run `lore compile` after some activity\n");
      return;
    }
    for (const a of adrs) {
      process.stdout.write(`${a.id}  [${a.status}]  ${a.title}\n`);
    }
    return;
  }

  const hits = store.searchAdrs(query, 8);
  if (hits.length === 0) {
    process.stdout.write(`lore: no ADRs match "${query}"\n`);
    process.exitCode = 1;
    return;
  }
  for (const hit of hits) {
    process.stdout.write(`${hit.adrId}  ${hit.title}\n    ${hit.snippet}\n\n`);
  }
}
