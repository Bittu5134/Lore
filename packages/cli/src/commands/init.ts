/**
 * `lore init` - create the .lore store and install the capture plumbing.
 *
 * Lane 0 (shared infrastructure): every other lane assumes these paths exist.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, DEFAULT_STATE, LORE_PATHS } from "@lore/core";

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/cli/src/commands -> packages/cli/src/index.ts */
const CLI_ENTRY = resolve(HERE, "..", "index.ts");
const TEMPLATE_FIXTURE = resolve(HERE, "..", "..", "..", "core", "fixtures", "adr-template.md");

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

function writeIfAbsent(path: string, content: string, mode?: number): boolean {
  if (existsSync(path)) return false;
  writeFileSync(path, content, "utf8");
  if (mode !== undefined) chmodSync(path, mode);
  return true;
}

function hookScript(reason: string, command: string): string {
  return `#!/bin/sh
# Lore ${reason} hook (installed by \`lore init\`).
# Runs synchronously so the wiki is updated the moment the event happens.
# Set LORE_HOOK_ASYNC=1 to detach instead.
if [ -n "\${LORE_HOOK_ASYNC:-}" ]; then
  npx --yes tsx "${CLI_ENTRY}" ${command} >/dev/null 2>&1 &
else
  npx --yes tsx "${CLI_ENTRY}" ${command} || true
fi
exit 0
`;
}

export async function run(_args: string[]): Promise<void> {
  const root = repoRoot();
  process.stdout.write(`lore: initialising in ${root}\n`);

  const created: string[] = [];
  for (const dir of [
    LORE_PATHS.raw,
    LORE_PATHS.wiki,
    LORE_PATHS.drafts,
    LORE_PATHS.meta,
    LORE_PATHS.hooks,
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  if (writeIfAbsent(join(root, LORE_PATHS.config), JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n"))
    created.push(LORE_PATHS.config);
  if (writeIfAbsent(join(root, LORE_PATHS.state), JSON.stringify(DEFAULT_STATE, null, 2) + "\n"))
    created.push(LORE_PATHS.state);

  const template = existsSync(TEMPLATE_FIXTURE)
    ? readFileSync(TEMPLATE_FIXTURE, "utf8")
    : "# ADR template unavailable\n";
  if (writeIfAbsent(join(root, LORE_PATHS.wiki, "ADR-0000-template.md"), template))
    created.push("wiki/ADR-0000-template.md");
  if (
    writeIfAbsent(
      join(root, LORE_PATHS.wiki, "index.md"),
      "# Lore Wiki Index\n\n_Generated. Regenerate with `lore compile`._\n\n| ID | Title | Status | Confidence |\n|----|-------|--------|------------|\n",
    )
  )
    created.push("wiki/index.md");

  // Git hooks -> committed inside .lore/hooks, activated via core.hooksPath.
  const hooks: Array<[string, string, string]> = [
    ["post-commit", "post-commit", "sync --auto"],
    ["post-merge", "post-merge", "reconcile"],
  ];
  for (const [name, reason, command] of hooks) {
    const p = join(root, LORE_PATHS.hooks, name);
    if (writeIfAbsent(p, hookScript(reason, command), 0o755)) created.push(`hooks/${name}`);
  }
  try {
    execFileSync("git", ["config", "core.hooksPath", LORE_PATHS.hooks], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    process.stderr.write("lore: warning: could not set git core.hooksPath (not a git repo?)\n");
  }

  // Continuity rule for Cline (and any agent that reads .clinerules).
  const ruleSource = resolve(HERE, "..", "..", "..", "..", ".clinerules", "lore.md");
  if (existsSync(ruleSource)) {
    mkdirSync(dirname(join(root, LORE_PATHS.ruleFile)), { recursive: true });
    if (writeIfAbsent(join(root, LORE_PATHS.ruleFile), readFileSync(ruleSource, "utf8")))
      created.push(LORE_PATHS.ruleFile);
  }

  process.stdout.write(
    `lore: ready (${created.length} files created)\n` +
      `  store: ${join(root, LORE_PATHS.wiki, "..")}\n` +
      `  hooks: git core.hooksPath -> ${LORE_PATHS.hooks}\n`,
  );
}
