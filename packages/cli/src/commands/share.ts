/**
 * `lore share [--out <file>]` - export the wiki as a portable bundle.
 *
 * Mechanism: hand another contributor (or another agent session) a single JSON
 * file carrying the decisions, without sharing the whole repository history.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStore, type Adr } from "@lore/core";

export interface LoreBundle {
  version: number;
  exportedAt: string;
  repo?: string;
  adrs: Adr[];
  rawEventCount: number;
}

export function buildBundle(root: string): LoreBundle {
  const store = createStore(root);
  const adrs = store
    .allAdrFrontmatter()
    .map((frontmatter) => store.readAdr(frontmatter.id))
    .filter((adr): adr is Adr => adr !== null);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    repo: root,
    adrs,
    rawEventCount: store.readEvents().length,
  };
}

export async function run(args: string[]): Promise<void> {
  const outIndex = args.indexOf("--out");
  const target = resolve(
    process.cwd(),
    (outIndex !== -1 ? args[outIndex + 1] : undefined) ?? ".lore/lore-bundle.json",
  );

  const bundle = buildBundle(process.cwd());
  if (bundle.adrs.length === 0) {
    process.stdout.write("lore: nothing to share - the wiki is empty\n");
    return;
  }

  writeFileSync(target, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  process.stdout.write(
    `lore: shared ${bundle.adrs.length} ADR(s) (${bundle.rawEventCount} raw events) -> ${target}\n`,
  );
}
