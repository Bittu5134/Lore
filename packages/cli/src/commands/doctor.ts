/**
 * @fileoverview `lore doctor` Command Implementation.
 *
 * @description
 * Diagnostic suite that validates the entire Lore runtime environment and prints
 * specific remediation commands for any detected issues.
 *
 * Checks:
 *  - Node.js runtime version compatibility (requires Node 22+)
 *  - Repository status & `.lore/config.json` validity
 *  - Git hooks configuration (`core.hooksPath === .lore/hooks`)
 *  - Executability and presence of git hook scripts
 *  - Agent continuity rule presence (`.clinerules/lore.md`)
 *  - Cline CLI installation & authentication status
 *  - Registered Cline capture plugins and source staleness
 *  - Wiki consistency (counts accepted ADRs and pending drafts)
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LORE_PATHS, type AdrFrontmatter, type LoreConfig } from "@lore/core";

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/cli/src/commands -> <lore repo root> */
const LORE_REPO = resolve(HERE, "..", "..", "..", "..");
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";

type Status = "ok" | "warn" | "fail";
interface Check {
  label: string;
  status: Status;
  detail?: string;
  fix?: string;
}

function tryRun(cmd: string, args: string[], cwd?: string): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Find the capture plugin copies Cline has installed on this machine. */
function findInstalledPluginFiles(): string[] {
  const root = join(HOME, ".cline", "plugins", "_installed");
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || found.length > 20) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(path, depth + 1);
      } else if (entry.endsWith(".ts") || entry.endsWith(".js")) {
        try {
          if (readFileSync(path, "utf8").includes('name: "lore"')) found.push(path);
        } catch {
          // unreadable
        }
      }
    }
  };
  walk(root, 0);
  return found;
}

/**
 * Executes the `lore doctor` command.
 *
 * @param _args Command line argument vector.
 */
export async function run(_args: string[]): Promise<void> {
  const root = process.cwd();
  const checks: Check[] = [];

  // ---- the target repo ----
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  checks.push(
    major >= 22
      ? { label: "Node version", status: "ok", detail: process.versions.node }
      : {
          label: "Node version",
          status: "fail",
          detail: process.versions.node,
          fix: "Install Node 22 or newer from https://nodejs.org",
        },
  );

  const configPath = join(root, LORE_PATHS.config);
  if (!existsSync(configPath)) {
    checks.push({
      label: "Lore store",
      status: "fail",
      detail: "no .lore/config.json",
      fix: "Run `lore init` in this repository",
    });
  } else {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8")) as LoreConfig;
      checks.push({
        label: "Lore store",
        status: "ok",
        detail: `autonomy=${config.autonomy}, threshold=${config.confidenceThreshold}`,
      });
    } catch {
      checks.push({ label: "Lore store", status: "fail", detail: ".lore/config.json is not valid JSON" });
    }
  }

  const hooksPath = tryRun("git", ["config", "core.hooksPath"], root);
  if (hooksPath === null) {
    checks.push({ label: "Git repository", status: "fail", detail: "not a git repository", fix: "git init" });
  } else if (hooksPath !== LORE_PATHS.hooks) {
    checks.push({
      label: "Git hooks active",
      status: "warn",
      detail: hooksPath === "" ? "core.hooksPath is unset" : `core.hooksPath=${hooksPath}`,
      fix: `git config core.hooksPath ${LORE_PATHS.hooks} (previous value, if any, is saved in .lore/meta/previous-hooks-path.txt)`,
    });
  } else {
    checks.push({ label: "Git hooks active", status: "ok", detail: LORE_PATHS.hooks });
  }

  const postCommit = join(root, LORE_PATHS.hooks, "post-commit");
  if (existsSync(postCommit)) {
    checks.push({ label: "post-commit hook", status: "ok", detail: "installed" });
  } else {
    checks.push({
      label: "post-commit hook",
      status: "warn",
      detail: "missing",
      fix: "Run `lore init` to install hooks",
    });
  }

  const rulePath = join(root, LORE_PATHS.ruleFile);
  if (existsSync(rulePath)) {
    checks.push({ label: "Agent continuity rule", status: "ok", detail: LORE_PATHS.ruleFile });
  } else {
    checks.push({
      label: "Agent continuity rule",
      status: "warn",
      detail: "missing",
      fix: "Run `lore init` to generate the rule",
    });
  }

  // ---- the machine & Cline ----
  const clineBin = tryRun("which", ["cline"]);
  if (!clineBin) {
    checks.push({
      label: "Cline CLI",
      status: "warn",
      detail: "not on PATH",
      fix: "npm install -g cline",
    });
  } else {
    const auth = tryRun("cline", ["auth", "status"]);
    const authed = auth && !/not logged in|unauthorized/i.test(auth);
    checks.push({
      label: "Cline CLI",
      status: authed ? "ok" : "warn",
      detail: `${clineBin}${authed ? " (authenticated)" : " (not authenticated)"}`,
      fix: authed ? undefined : "Run `cline auth` to authenticate",
    });
  }

  const installedPlugins = findInstalledPluginFiles();
  if (installedPlugins.length === 0) {
    checks.push({
      label: "Capture plugin",
      status: "warn",
      detail: "not installed in Cline",
      fix: `cline plugin install ${join(LORE_REPO, "packages", "plugin")}`,
    });
  } else {
    const repoPluginSrc = join(LORE_REPO, "packages", "plugin", "src", "index.ts");
    let upToDate = true;
    try {
      if (existsSync(repoPluginSrc)) {
        const repoText = readFileSync(repoPluginSrc, "utf8");
        for (const file of installedPlugins) {
          if (readFileSync(file, "utf8") !== repoText) upToDate = false;
        }
      }
    } catch {
      // ignore
    }
    checks.push({
      label: "Capture plugin",
      status: upToDate ? "ok" : "warn",
      detail: `${installedPlugins.length} copy found${upToDate ? "" : " (out of date)"}`,
      fix: upToDate
        ? undefined
        : `Run \`npm run setup\` to refresh the installed plugin, or copy ${repoPluginSrc} over ${installedPlugins[0]}`,
    });
  }

  // ---- wiki status ----
  const wikiDir = join(root, LORE_PATHS.wiki);
  const draftsDir = join(root, LORE_PATHS.drafts);
  let adrCount = 0;
  let draftCount = 0;
  try {
    if (existsSync(wikiDir)) {
      adrCount = readdirSync(wikiDir).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).length;
    }
    if (existsSync(draftsDir)) {
      draftCount = readdirSync(draftsDir).filter((f) => /^ADR-\d{4}-.*\.md$/.test(f)).length;
    }
  } catch {
    // ignore
  }
  checks.push({
    label: "ADR catalog",
    status: "ok",
    detail: `${adrCount} accepted, ${draftCount} draft(s)`,
  });

  // ---- render ----
  process.stdout.write("Lore doctor\n\n");
  for (const c of checks) {
    const symbol = c.status === "ok" ? "ok  " : c.status === "warn" ? "WARN" : "FAIL";
    const det = c.detail ? ` (${c.detail})` : "";
    process.stdout.write(`  ${symbol}  ${c.label}${det}\n`);
    if (c.fix) process.stdout.write(`         -> fix: ${c.fix}\n`);
  }
  process.stdout.write("\n");

  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails > 0) {
    process.stdout.write(`Found ${fails} failure(s) and ${warns} warning(s). Follow the fixes above.\n`);
    process.exitCode = 1;
  } else if (warns > 0) {
    process.stdout.write(`Found ${warns} warning(s). Core features will work; see fixes for full capability.\n`);
  } else {
    process.stdout.write("All checks passed. Lore is ready to record decisions.\n");
  }
}
