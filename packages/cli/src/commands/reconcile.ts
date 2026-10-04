/**
 * @fileoverview `lore reconcile` Command Implementation.
 *
 * @description
 * Automated resolution engine for divergent architectural wiki files following a git merge.
 *
 * Merging Strategies:
 * 1. Intra-Page Conflict Markers: Resolves `<<<<<<< / ======= / >>>>>>>` markers by preserving
 *    BOTH variants in sequence separated by an explanatory HTML comment. Knowledge is never dropped.
 * 2. ID Collision Resolution: When concurrent branches both authored records with the same
 *    ID (e.g. two authors created `ADR-0012`), the second record is automatically renumbered
 *    to the next unused sequential ID, and references within the file are adjusted.
 * 3. Commit Integration: Automatically stages the reconciled wiki changes and commits
 *    as `lore: reconcile wiki`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LORE_PATHS,
  createStore,
  formatAdrFilename,
  numericId,
  padId,
  parseAdr,
  renderAdr,
} from "@lore/core";

const CONFLICT = /<<<<<<<[^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*\n/g;

/**
 * Resolves standard Git conflict markers by appending both ours and theirs bodies.
 */
function mergeConflictMarkers(markdown: string): string {
  return markdown.replace(CONFLICT, (_match, ours: string, theirs: string) => {
    const a = ours.trim();
    const b = theirs.trim();
    if (b === "" || a === b) return ours;
    if (a === "") return theirs;
    return `${ours.trimEnd()}\n\n<!-- lore: merged an incoming variant of this decision -->\n\n${theirs.trimEnd()}\n`;
  });
}

function dirRel(dir: "wiki" | "drafts"): string {
  return dir === "wiki" ? LORE_PATHS.wiki : LORE_PATHS.drafts;
}

/**
 * Executes the `lore reconcile` command.
 *
 * @param _args Command line argument vector.
 */
export async function run(_args: string[]): Promise<void> {
  const root = process.cwd();
  const store = createStore(root);
  let resolvedMarkers = 0;
  let renumbered = 0;

  // 1. Conflict markers inside a page: keep both variants.
  for (const dir of ["wiki", "drafts"] as const) {
    for (const file of store.listAdrFiles(dir)) {
      const path = join(root, dirRel(dir), file);
      const content = readFileSync(path, "utf8");
      if (!content.includes("<<<<<<<")) continue;
      writeFileSync(path, mergeConflictMarkers(content), "utf8");
      resolvedMarkers += 1;
    }
  }

  // 2. Two branches added pages with the same ADR id: renumber the later one.
  const seen = new Set<string>();
  for (const dir of ["wiki", "drafts"] as const) {
    for (const file of store.listAdrFiles(dir)) {
      const path = join(root, dirRel(dir), file);
      let adr;
      try {
        adr = parseAdr(readFileSync(path, "utf8"));
      } catch {
        continue;
      }
      const id = adr.frontmatter.id;
      if (!seen.has(id)) {
        seen.add(id);
        continue;
      }
      let n = numericId(id);
      while (seen.has(padId(n + 1))) n += 1;
      const newId = padId(n + 1);
      adr.frontmatter.id = newId;
      adr.body = adr.body.replace(`# ${id}:`, `# ${newId}:`);
      const newPath = join(dirname(path), formatAdrFilename(adr));
      writeFileSync(newPath, renderAdr(adr), "utf8");
      if (newPath !== path) unlinkSync(path);
      seen.add(newId);
      renumbered += 1;
    }
  }

  if (resolvedMarkers === 0 && renumbered === 0) {
    process.stdout.write("lore: nothing to reconcile - the wiki is already consistent\n");
    return;
  }

  store.regenerateIndex();

  try {
    execFileSync("git", ["add", LORE_PATHS.wiki, LORE_PATHS.drafts], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "--no-verify", "-m", "lore: reconcile wiki"], {
      cwd: root,
      stdio: "ignore",
    });
    process.stdout.write(
      `lore: reconciled (${resolvedMarkers} conflict(s) merged, ${renumbered} id(s) renumbered) and committed\n`,
    );
  } catch {
    process.stdout.write(
      `lore: reconciled (${resolvedMarkers} conflict(s), ${renumbered} id(s)) - commit skipped\n`,
    );
  }
}
