import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { LoreConfigLite } from "./types.ts";

export function loreRoot(): string {
  return process.env.LORE_ROOT ?? process.cwd();
}

/**
 * True while Lore is running its own `cline` inference (`lore compile`/`sync`).
 * Cline may sandbox plugins without inheriting our env vars, so this filesystem
 * marker - written by the compiler - is the reliable signal.
 */
export function inferenceInFlight(): boolean {
  try {
    const stat = statSync(join(loreRoot(), ".lore", "meta", "inference.lock"));
    return Date.now() - stat.mtimeMs < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export function readLoreConfig(root: string): LoreConfigLite | null {
  try {
    return JSON.parse(readFileSync(join(root, ".lore", "config.json"), "utf8")) as LoreConfigLite;
  } catch {
    return null;
  }
}

/**
 * Where `lore compile` can be run from. Known only after `lore init` recorded
 * loreHome - we never guess, because a wrong path would make Cline run a
 * random file on the user's machine.
 */
export function compileCommand(root: string): { cmd: string; args: string[] } | null {
  const home = readLoreConfig(root)?.loreHome;
  if (!home) return null;
  const entry = join(home, "packages", "cli", "src", "index.ts");
  if (!existsSync(entry)) return null;
  const tsx = join(home, "node_modules", ".bin", "tsx");
  if (existsSync(tsx)) return { cmd: process.execPath, args: [tsx, entry, "compile"] };
  return { cmd: "npx", args: ["--yes", "tsx", entry, "compile"] };
}

/**
 * AUTO-COMPILE: When a run ends, the session's captured evidence is distilled
 * into a decision record without the user running anything. Detached + fail-open:
 * the agent loop never waits, never breaks, and recursion is impossible.
 */
export function spawnDetachedCompile(root: string): void {
  const logPath = join(root, ".lore", "meta", "compile.log");
  try {
    mkdirSync(join(root, ".lore", "meta"), { recursive: true });
    const cmd = compileCommand(root);
    if (!cmd) {
      appendFileSync(logPath, `${new Date().toISOString()} skip: no compile command (run lore init?)\n`);
      return;
    }
    const fd = openSync(logPath, "a");
    const child = spawn(cmd.cmd, cmd.args, {
      cwd: root,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, LORE_ROOT: root },
    });
    child.unref();
  } catch {
    // fail-open
  }
}
