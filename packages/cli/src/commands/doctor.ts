/**
 * `lore doctor` - diagnose the Lore installation.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LORE_PATHS, type LoreConfig } from "@lore/core";

function check(label: string, ok: boolean, detail = ""): boolean {
  process.stdout.write(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}\n`);
  return ok;
}

export async function run(_args: string[]): Promise<void> {
  const root = process.cwd();
  process.stdout.write(`lore doctor — ${root}\n`);
  let failures = 0;
  const fail = (b: boolean) => {
    if (!b) failures += 1;
  };

  fail(check(".lore/config.json exists", existsSync(join(root, LORE_PATHS.config))));

  let config: LoreConfig | undefined;
  try {
    config = JSON.parse(readFileSync(join(root, LORE_PATHS.config), "utf8")) as LoreConfig;
    fail(check("config.json parses", true, `autonomy=${config.autonomy}`));
  } catch (err) {
    fail(check("config.json parses", false, (err as Error).message));
  }

  try {
    const hooksPath = execFileSync("git", ["config", "core.hooksPath"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    fail(check("git core.hooksPath", hooksPath === LORE_PATHS.hooks, hooksPath || "(unset)"));
  } catch {
    fail(check("git repo", false, "not a git repository"));
  }

  try {
    const version = execFileSync("cline", ["--version"], { encoding: "utf8" }).trim();
    fail(check("cline CLI available", true, `v${version}`));
  } catch {
    fail(check("cline CLI available", false, "install with: npm i -g cline"));
  }

  process.stdout.write(failures === 0 ? "lore: healthy\n" : `lore: ${failures} issue(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}
