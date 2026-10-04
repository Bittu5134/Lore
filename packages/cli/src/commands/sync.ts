/**
 * `lore sync [--auto]` - turn git commits into wiki knowledge.
 *
 * Reads commits since the cursor, records them as raw events, and compiles an
 * ADR. `--auto` (used by the post-commit hook) is silent and never fails.
 */
import { execFileSync } from "node:child_process";
import { createClineCompiler, createStore, type LoreEvent } from "@lore/core";
import { FIXTURE_DECISION } from "./compile.ts";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    // A large commit (e.g. a big refactor) can produce a multi-MB diff.
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

export function commitToEvent(root: string, sha: string): LoreEvent {
  const ts = git(root, ["log", "-1", "--pretty=format:%cI", sha]) || new Date().toISOString();
  const message = git(root, ["log", "-1", "--pretty=format:%s%n%n%b", sha]);
  const files = git(root, ["show", "--name-only", "--pretty=format:", sha])
    .split("\n")
    .filter((line) => line.trim() !== "");
  const diff = git(root, ["show", "--patch", "--pretty=format:", "--unified=3", sha]).slice(0, 8000);
  return {
    ts,
    source: "git-commit",
    kind: "commit",
    commit: sha,
    payload: { message, files, diff },
  };
}

export function commitsSince(root: string, cursor: string | undefined): string[] {
  const range = cursor ? `${cursor}..HEAD` : "HEAD";
  try {
    return git(root, ["log", "--reverse", "--pretty=format:%H", range])
      .split("\n")
      .filter((line) => line.trim() !== "");
  } catch {
    return [];
  }
}

/** Every commit in the repository, oldest first. Used by `lore backfill`. */
export function allCommits(root: string): string[] {
  try {
    return git(root, ["log", "--reverse", "--pretty=format:%H"])
      .split("\n")
      .filter((line) => line.trim() !== "");
  } catch {
    return [];
  }
}

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
}
