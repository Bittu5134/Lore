/**
 * `lore pull <file>` - import a wiki bundle from another contributor.
 *
 * Ids already present locally are skipped; imported ADRs go to wiki/ (accepted)
 * or drafts/ (draft status), and the index is regenerated.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStore } from "@lore/core";
import type { LoreBundle } from "./share.ts";

export async function run(args: string[]): Promise<void> {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write("usage: lore pull <bundle.json>\n");
    process.exitCode = 1;
    return;
  }

  const bundle = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8")) as LoreBundle;
  if (!Array.isArray(bundle.adrs)) {
    process.stderr.write("lore: not a Lore bundle (missing adrs[])\n");
    process.exitCode = 1;
    return;
  }

  const store = createStore(process.cwd());
  let imported = 0;
  let skipped = 0;

  for (const adr of bundle.adrs) {
    if (store.readAdr(adr.frontmatter.id)) {
      skipped += 1;
      continue;
    }
    store.writeAdr({
      route: adr.frontmatter.status === "draft" ? "drafts" : "wiki",
      confidence: adr.frontmatter.confidence,
      adr,
    });
    imported += 1;
  }

  process.stdout.write(
    `lore: pulled ${imported} ADR(s)${skipped > 0 ? `, skipped ${skipped} already present` : ""} ` +
      `from ${file}\n`,
  );
}
