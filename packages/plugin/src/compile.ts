/**
 * @fileoverview Auto-Compilation Subprocess Manager for the Cline Plugin.
 *
 * @description
 * Manages background compilation tasks triggered when Cline sessions complete.
 *
 * Autonomous Execution Invariant:
 * When an agent run ends (via `run-finished` or `run-failed`), Lore spawns a
 * completely detached Node subprocess running `lore compile`. This guarantees:
 * 1. The agent session and user experience are never blocked or delayed.
 * 2. If the compilation process fails or crashes, the host agent remains unaffected (fail-open).
 * 3. A filesystem-based lock (`.lore/meta/inference.lock`) prevents self-capture feedback loops.
 */

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { LoreConfigLite } from "./types.ts";

/**
 * Returns the effective repository root path, checking `LORE_ROOT` or defaulting to `cwd`.
 */
export function loreRoot(): string {
  return process.env.LORE_ROOT ?? process.cwd();
}

/**
 * Checks whether a Lore inference task is actively executing.
 * Uses a filesystem lock (`.lore/meta/inference.lock`) with a 10-minute timeout safeguard.
 *
 * @returns True if inference is currently running.
 */
export function inferenceInFlight(): boolean {
  try {
    const stat = statSync(join(loreRoot(), ".lore", "meta", "inference.lock"));
    return Date.now() - stat.mtimeMs < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Reads `.lore/config.json` safely without throwing exceptions.
 *
 * @param root Repository root directory.
 * @returns Parsed configuration object or `null`.
 */
export function readLoreConfig(root: string): LoreConfigLite | null {
  try {
    return JSON.parse(readFileSync(join(root, ".lore", "config.json"), "utf8")) as LoreConfigLite;
  } catch {
    return null;
  }
}

/**
 * Determines the executable command and arguments needed to trigger `lore compile`.
 * Resolves local tsx binaries or falls back to `npx --yes tsx`.
 *
 * @param root Repository root directory.
 * @returns Command and argument tuple, or `null` if Lore is not configured.
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
 * AUTO-COMPILE TRIGGER:
 * Spawns a detached, asynchronous `lore compile` subprocess when an agent run terminates.
 * Outputs are directed to `.lore/meta/compile.log`.
 *
 * @param root Repository root directory.
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
    // Fail-open: compilation failures must never affect the agent host
  }
}
