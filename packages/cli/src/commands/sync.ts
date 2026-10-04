/**
 * @fileoverview `lore sync` Command Implementation.
 *
 * @description
 * Synchronizes Git commit history with the Lore knowledge engine:
 * 1. Reads commits landing between the recorded `lastCommit` cursor and `HEAD`.
 * 2. Normalizes commits and diffs into `git-commit` telemetry events.
 * 3. Invokes the compiler to distil rationale and alternatives from commit evidence.
 * 4. Records new ADRs in `.lore/wiki/` or `.lore/drafts/`.
 * 5. Advances the durable commit cursor (`state.json`).
 *
 * Invoked automatically by the git `post-commit` hook via `lore sync --auto`.
 */

import { execFileSync } from "node:child_process";
import { createClineCompiler, createStore, type LoreEvent } from "@lore/core";
import { FIXTURE_DECISION } from "./compile.ts";

/** Helper executing git commands in the repository root with enlarged buffer limits. */
function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    // Large refactoring commits can produce multi-MB diffs.
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

/**
 * Extracts commit metadata and unified diff, converting it to a LoreEvent.
 * Automatically excludes internal `.lore/**` paths to prevent cursor churn.
 *
 * @param root Repository root directory.
 * @param sha Commit hash.
 * @returns Structured LoreEvent.
 */
export function commitToEvent(root: string, sha: string): LoreEvent {
  const ts = git(root, ["log", "-1", "--pretty=format:%cI", sha]) || new Date().toISOString();
  const message = git(root, ["log", "-1", "--pretty=format:%s%n%n%b", sha]);
  // Exclude Lore's own internal directories (.lore/**) so decisions describe
  // user code, not our own cursor/raw-evidence churn.
  const files = git(root, ["show", "--name-only", "--pretty=format:", sha, "--", ".", ":(exclude).lore/**"])
    .split("\n")
    .filter((line) => line.trim() !== "");
  const diff = git(root, [
    "show",
    "--patch",
    "--pretty=format:",
    "--unified=3",
    sha,
    "--",
    ".",
    ":(exclude).lore/**",
  ]).slice(0, 8000);
  return {
    ts,
    source: "git-commit",
    kind: "commit",
    commit: sha,
    payload: { message, files, diff },
  };
}

/**
 * Retrieves an array of commit SHAs between the cursor and HEAD.
 * Implements self-healing: if the cursor is unknown (e.g. force-push or fresh clone),
 * it falls back cleanly to the full log.
 *
 * @param root Repository root directory.
 * @param cursor Commit hash cursor from state.json.
 * @returns Array of commit hashes in chronological order.
 */
export function commitsSince(root: string, cursor: string | undefined): string[] {
  const range = cursor ? `${cursor}..HEAD` : "HEAD";
  try {
    return git(root, ["log", "--reverse", "--pretty=format:%H", range])
      .split("\n")
      .filter((line) => line.trim() !== "");
  } catch {
    // A cursor the current repo does not know (fresh clone, squashed/force-pushed
    // history, a cursor committed from another machine) makes the range invalid.
    // Retrying with the full log self-heals instead of silently processing nothing.
    if (!cursor) return [];
    try {
      return git(root, ["log", "--reverse", "--pretty=format:%H"])
        .split("\n")
        .filter((line) => line.trim() !== "");
    } catch {
      return [];
    }
  }
}

/**
 * Returns every commit in the repository from root commit to HEAD.
 * Used primarily by `lore backfill`.
 *
 * @param root Repository root directory.
 * @returns Array of all commit hashes in chronological order.
 */
export function allCommits(root: string): string[] {
  try {
    return git(root, ["log", "--reverse", "--pretty=format:%H"])
      .split("\n")
      .filter((line) => line.trim() !== "");
  } catch {
    return [];
  }
}

/**
 * Executes the `lore sync` command.
 *
 * @param args Command line arguments (`--auto`, `--fixture`).
 */
export async function run(args: string[]): Promise<void> {
  const quiet = args.includes("--auto");
  const log = (message: string): void => {
    if (!quiet) process.stdout.write(`${message}\n`);
  };

  const root = process.cwd();
  const store = createStore(root);
  const cursor = store.readState().lastCommit;

  const commits = commitsSince(root, cursor);
  if (commits.length === 0) {
    log("lore: no new commits since cursor");
    return;
  }

  const events = commits.map((sha) => commitToEvent(root, sha));
  store.appendEvents(events);
  log(`lore: captured ${events.length} commit(s)`);

  const fixture = args.includes("--fixture");
  const compiler = fixture
    ? createClineCompiler(store.readConfig(), { infer: () => JSON.stringify(FIXTURE_DECISION) })
    : createClineCompiler(store.readConfig());
  const results = await compiler.compile({
    events,
    repoRoot: root,
    existing: store.allAdrFrontmatter(),
    reason: `git commit(s) ${commits.map((c) => c.slice(0, 8)).join(", ")}`,
  });

  const head = commits[commits.length - 1];
  if (head) store.writeState({ ...store.readState(), lastCommit: head });

  if (results.length === 0) {
    log("lore: no architectural decision in these commits (nothing recorded)");
    return;
  }
  for (const result of results) {
    const written = store.writeAdr(result);
    log(
      `lore: ${written.id} (confidence ${result.confidence.toFixed(2)}) -> ${written.path}` +
        `${result.route === "drafts" ? "  [draft - needs review]" : ""}`,
    );
  }
  store.regenerateIndex();
}
