/**
 * `lore doctor` - verify the whole installation and print actionable fixes.
 *
 * Checks the target repo (cwd) AND the machine: Node, the store, git hooks,
 * the Cline CLI + auth, and whether the installed capture plugin is current.
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

  const wanted = ["post-commit", "post-merge"];
  const present = wanted.filter((h) => existsSync(join(root, LORE_PATHS.hooks, h)));
  checks.push(
    present.length === wanted.length
      ? { label: "Hook scripts", status: "ok", detail: present.join(", ") }
      : {
          label: "Hook scripts",
          status: "warn",
          detail: `missing ${wanted.filter((h) => !present.includes(h)).join(", ")}`,
          fix: "Re-run `lore init`",
        },
  );

  const wikiDir = join(root, LORE_PATHS.wiki);
  const adrs = existsSync(wikiDir)
    ? readdirSync(wikiDir).filter((f) => /^ADR-\d{4}-/.test(f)).length
    : 0;
  checks.push({
    label: "Wiki",
    status: adrs > 0 ? "ok" : "warn",
    detail: `${adrs} ADR(s)`,
    fix: adrs === 0 ? "Run `lore compile` (or `lore compile --fixture`) after some activity" : undefined,
  });

  // ---- the machine ----
  const clineVersion = tryRun("cline", ["--version"]);
  checks.push(
    clineVersion
      ? { label: "Cline CLI", status: "ok", detail: `v${clineVersion.replace(/^v/, "")}` }
      : {
          label: "Cline CLI",
          status: "warn",
          detail: "not found",
          fix: "npm i -g cline (or demo offline with `lore compile --fixture`)",
        },
  );

  const providers = join(HOME, ".cline", "data", "settings", "providers.json");
  if (!clineVersion) {
    checks.push({ label: "Cline auth", status: "warn", detail: "unknown (no cline CLI)" });
  } else if (!existsSync(providers)) {
    checks.push({
      label: "Cline auth",
      status: "warn",
      detail: "no provider configured",
      fix: "cline auth (or use `lore compile --fixture`)",
    });
  } else {
    checks.push({ label: "Cline auth", status: "ok", detail: "provider configured" });
  }

  const localPlugin = join(LORE_REPO, "packages", "plugin", "src", "index.ts");
  const installed = findInstalledPluginFiles();
  if (!clineVersion || installed.length === 0) {
    checks.push({
      label: "Capture plugin",
      status: "warn",
      detail: clineVersion ? "not installed" : "unknown (no cline CLI)",
      fix: `cline plugin install ${join(LORE_REPO, "packages", "plugin")}`,
    });
  } else if (existsSync(localPlugin)) {
    const local = readFileSync(localPlugin, "utf8");
    const inSync = installed.some((p) => readFileSync(p, "utf8") === local);
    checks.push(
      inSync
        ? { label: "Capture plugin", status: "ok", detail: `${installed.length} copy, in sync` }
        : {
            label: "Capture plugin",
            status: "warn",
            detail: "installed copy is STALE (older than this checkout)",
            fix: `cline plugin uninstall lore && cline plugin install ${join(LORE_REPO, "packages", "plugin")}`,
          },
    );
  } else {
    checks.push({ label: "Capture plugin", status: "ok", detail: `${installed.length} installed` });
  }

  const mcpConfig = join(HOME, ".cline", "mcp.json");
  const mcpRegistered = existsSync(mcpConfig) && readFileSync(mcpConfig, "utf8").includes('"lore"');
  checks.push({
    label: "MCP server",
    status: mcpRegistered ? "ok" : "warn",
    detail: mcpRegistered ? "registered in ~/.cline/mcp.json" : "not registered",
    fix: "See packages/mcp/README.md (needed for the VS Code extension)",
  });

  // ---- report ----
  process.stdout.write(`lore doctor — ${root}\n`);
  for (const c of checks) {
    const tag = c.status === "ok" ? "  ok  " : c.status === "warn" ? " WARN " : " FAIL ";
    process.stdout.write(`${tag} ${c.label}${c.detail ? ` — ${c.detail}` : ""}\n`);
    if (c.fix && c.status !== "ok") process.stdout.write(`       fix: ${c.fix}\n`);
  }

  const failures = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  process.stdout.write(
    failures === 0
      ? `lore: healthy${warnings > 0 ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}\n`
      : `lore: ${failures} problem(s)${warnings > 0 ? `, ${warnings} warning(s)` : ""}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
