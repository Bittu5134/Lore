/**
 * `lore reconcile` - merge divergent wiki edits after a git merge.
 *
 * Two branches can both extend the wiki, producing (a) raw conflict markers in
 * the same page, and/or (b) two pages claiming the same ADR id. Reconcile keeps
 * BOTH sides' knowledge: conflict markers are resolved by retaining both
 * variants, and duplicate ids are renumbered (content preserved). The result is
 * committed as `lore: reconcile wiki`.
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
