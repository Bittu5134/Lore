import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commitsSince } from "../src/commands/sync.ts";

/**
 * A cursor SHAs the current repo does not know used to make `git log <sha>..HEAD`
 * fail, and commitsSince swallowed that error into an empty list - so a fresh
 * clone (or a squashed/force-pushed history) silently captured nothing at all.
 */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "lore-sync-"));
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "test@lore.dev");
  git("config", "user.name", "lore test");
  git("commit", "-q", "--allow-empty", "-m", "first");
  git("commit", "-q", "--allow-empty", "-m", "second");
  return root;
}

test("commitsSince returns commits after a known cursor", () => {
  const root = repo();
  try {
    const shas = execFileSync("git", ["log", "--pretty=format:%H"], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    const since = commitsSince(root, shas[1]);
    assert.deepEqual(since, [shas[0]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commitsSince recovers when the cursor is unknown to this repo", () => {
  const root = repo();
  try {
    const all = commitsSince(root, undefined);
    assert.equal(all.length, 2);
    const recovered = commitsSince(root, "0000000000000000000000000000000000000000");
    assert.deepEqual(recovered, all);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
