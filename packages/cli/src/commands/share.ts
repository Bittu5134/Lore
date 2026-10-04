/**
 * @fileoverview `lore share` Command Implementation.
 *
 * @description
 * Exports the complete architectural wiki into a portable, single-file JSON bundle
 * for distribution across repositories, offline analysis, or onboarding teammates.
 *
 * Bundle Payload:
 * Includes all accepted and draft ADRs alongside total telemetry counts,
 * without bundling sensitive git history or massive raw log files.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStore, type Adr } from "@lore/core";

/**
 * Portable schema representation of an exported Lore knowledge bundle.
 */
export interface LoreBundle {
  version: number;
  exportedAt: string;
  repo?: string;
  adrs: Adr[];
  rawEventCount: number;
}

/**
 * Extracts all ADRs from the store into a standalone bundle structure.
 *
 * @param root Repository root directory.
 * @returns Fully populated LoreBundle.
 */
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

/**
 * Executes the `lore share` command.
 *
 * @param args Command line arguments (`--out <path>`).
 */
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
