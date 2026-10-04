/**
 * @fileoverview `lore init` Command Implementation.
 *
 * @description
 * Bootstraps the complete Lore infrastructure inside a target repository:
 * 1. Storage Layout: Initializes `.lore/` directory tree (`config.json`, `hooks/`, `raw/`,
 *    `wiki/`, `drafts/`, `meta/`).
 * 2. Agent Continuity Rule: Generates `.clinerules/lore.md` injecting instructions into Cline sessions.
 * 3. Git Hooks: Installs `post-commit` (`lore sync --auto`) and `post-merge` (`lore reconcile`)
 *    hooks into `.lore/hooks` and points `git config core.hooksPath` to them.
 * 4. Safety Preservation: If an existing `core.hooksPath` (such as Husky or Lefthook) is detected,
 *    its path is preserved in `.lore/meta/previous-hooks-path.txt`.
 * 5. Gitignore Protection: Appends local machine cursors and raw evidence directories to `.gitignore`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, LORE_PATHS } from "@lore/core";

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/cli/src/commands -> packages/cli/src/index.ts */
const CLI_ENTRY = resolve(HERE, "..", "index.ts");
/** packages/cli/src/commands -> <repo>/node_modules/.bin/tsx (offline hook fallback). */
const TSX_BIN = resolve(HERE, "..", "..", "..", "..", "node_modules", ".bin", "tsx");
/** packages/cli/src/commands -> the Lore installation root (recorded in config.json). */
const LORE_REPO = resolve(HERE, "..", "..", "..", "..");

/**
 * The continuity rule, embedded so `lore init` works no matter how lore was
 * installed (clone, npm link, global) - never read from a repo-relative path.
 */
const RULE_TEXT = `# Lore — Architectural Memory

\`.lore/\` holds the WHY behind this repository's code: architectural decision
records (ADRs) in \`.lore/wiki/ADR-*.md\`.

## Before you edit code

1. Read \`.lore/wiki/index.md\`.
2. If a \`search_lore\` tool is available, search for the files and concepts you are
   about to touch. Otherwise read the 2-3 ADRs whose titles or tags match your
   task. Read at most 3 - respect the context budget.
3. If an ADR covers your area, follow it. To contradict it, say explicitly in
   your final answer which ADR you are superseding and why.

## While you work

4. When you make a non-obvious choice (a library, a pattern, a data structure, a
   trade-off), record it: call the \`record_decision\` tool if available, or write
   an ADR to \`.lore/drafts/\` using \`.lore/wiki/ADR-0000-template.md\`. Always
   include the alternatives you rejected and the reason - that is the most
   valuable part.
5. Never edit \`.lore/raw/\` (immutable evidence) or \`.lore/meta/\` (bookkeeping).

## At the end

6. State which ADRs you consulted and what you recorded.
`;

/** Finds the top-level repository root directory via git, or falls back to cwd. */
function repoRoot(): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

/** Idempotently writes a file only if it does not already exist. */
function writeIfAbsent(path: string, content: string, mode?: number): boolean {
  if (existsSync(path)) return false;
  writeFileSync(path, content, "utf8");
  if (mode !== undefined) chmodSync(path, mode);
  return true;
}

/** Generates executable shell script wrapper for git lifecycle hooks. */
function hookScript(hook: string, command: string): string {
  return `#!/bin/sh
# Lore ${hook} hook (installed by \`lore init\`).
# Resolution order: lore on PATH -> repo-local tsx (works offline) -> npx tsx.
# Set LORE_HOOK_ASYNC=1 to detach instead of waiting for the model call.
if command -v lore >/dev/null 2>&1; then
  LORE_CMD="lore"
elif [ -x "${TSX_BIN}" ]; then
  LORE_CMD="${TSX_BIN} ${CLI_ENTRY}"
else
  LORE_CMD="npx --yes tsx ${CLI_ENTRY}"
fi
if [ -n "\${LORE_HOOK_ASYNC:-}" ]; then
  (\$LORE_CMD ${command} >/dev/null 2>&1 &)
else
  (\$LORE_CMD ${command} >/dev/null 2>&1 || true)
fi
exit 0
`;
}

/**
 * Executes the `lore init` command.
 *
 * @param args Command line arguments (`--no-hooks`).
 */
export async function run(args: string[]): Promise<void> {
  const root = repoRoot();
  const installHooks = !args.includes("--no-hooks");
  process.stdout.write(`lore: initialising in ${root}\n`);

  // Store: dirs, config, state, ADR template, index (idempotent).
  const store = createStore(root);
  store.init();

  // Record where Lore lives so the capture plugin can register the MCP server
  // and the hooks can find the CLI without absolute paths baked at build time.
  const config = store.readConfig();
  if (config.loreHome !== LORE_REPO) store.writeConfig({ ...config, loreHome: LORE_REPO });

  const created: string[] = [];

  // Continuity rule - embedded text, so this works for any install method.
  const rulePath = join(root, LORE_PATHS.ruleFile);
  mkdirSync(dirname(rulePath), { recursive: true });
  if (writeIfAbsent(rulePath, RULE_TEXT)) created.push(LORE_PATHS.ruleFile);

  // Ensure machine-local bookkeeping and raw evidence stay out of git in user repos.
  const gitignorePath = join(root, ".gitignore");
  const loreIgnores = [
    "# Lore local state (ADRs in .lore/wiki/ are committed; raw logs and cursors stay local)",
    ".lore/raw/",
    ".lore/meta/state.json",
    ".lore/meta/inference.lock",
    ".lore/meta/previous-hooks-path.txt",
    ".lore/meta/search.db",
    ".lore/meta/links.json",
    ".lore/wiki/graph.html",
  ];
  let existingGitignore = "";
  try {
    existingGitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  } catch {
    existingGitignore = "";
  }
  const toAppend = loreIgnores.filter((line) => !existingGitignore.includes(line));
  if (toAppend.length > 0) {
    const trailingNewline = existingGitignore === "" || existingGitignore.endsWith("\n") ? "" : "\n";
    writeFileSync(gitignorePath, `${existingGitignore}${trailingNewline}${toAppend.join("\n")}\n`, "utf8");
    created.push(".gitignore");
  }

  if (installHooks) {
    // Hooks live in .lore/hooks (committed with the repo) and are activated via core.hooksPath.
    mkdirSync(join(root, LORE_PATHS.hooks), { recursive: true });
    const hooks = [
      ["post-commit", "sync --auto"],
      ["post-merge", "reconcile"],
    ] as const;
    for (const [hook, command] of hooks) {
      const path = join(root, LORE_PATHS.hooks, hook);
      if (writeIfAbsent(path, hookScript(hook, command), 0o755)) created.push(`hooks/${hook}`);
    }

    // Never silently clobber someone else's hooks (husky, lefthook, ...).
    let previous = "";
    try {
      previous = execFileSync("git", ["config", "core.hooksPath"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      previous = "";
    }
    if (previous !== "" && previous !== LORE_PATHS.hooks) {
      writeFileSync(join(root, LORE_PATHS.meta, "previous-hooks-path.txt"), `${previous}\n`, "utf8");
      process.stdout.write(
        `lore: note: replaced existing core.hooksPath "${previous}"\n` +
          `      saved to .lore/meta/previous-hooks-path.txt\n` +
          `      restore with: git config core.hooksPath ${previous}\n`,
      );
    }

    try {
      execFileSync("git", ["config", "core.hooksPath", LORE_PATHS.hooks], {
        cwd: root,
        stdio: "ignore",
      });
    } catch {
      process.stderr.write("lore: warning: could not set git core.hooksPath (not a git repo?)\n");
    }
  } else {
    process.stdout.write("lore: skipped git hooks (--no-hooks)\n");
  }

  process.stdout.write(
    `lore: ready${created.length > 0 ? ` (${created.length} file(s) created)` : " (store already present)"}\n` +
      `  store: ${join(root, LORE_PATHS.wiki, "..")}\n` +
      (installHooks ? `  hooks: git core.hooksPath -> ${LORE_PATHS.hooks}\n` : "") +
      `  rule:  ${LORE_PATHS.ruleFile}\n` +
      `  next:  just work normally — decisions write themselves (.lore/wiki/)\n` +
      `  check: lore query <words>   ·   lore (dashboard)\n`,
  );
}
