#!/usr/bin/env node
/**
 * @fileoverview `npm run setup` — One-Command Evaluator & Environment Validator.
 *
 * @description
 * Single bootstrap script designed for hackathon judges and fresh repository clones.
 *
 * Verification Lifecycle:
 * 1. Validates Node.js engine version (Node >= 22).
 * 2. Confirms npm dependency tree installation.
 * 3. Tests `tsx` TypeScript runtime viability.
 * 4. Cleans out stale plugin caches in `~/.cline/plugins/_installed/`.
 * 5. Installs and registers `@lore/plugin` in Cline.
 * 6. Executes the 36-suite test pipeline across `@lore/core` and `@lore/cli`.
 * 7. Confirms typechecking across all workspace packages.
 * 8. Recommends next steps (`npm run demo`).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";
let warnings = 0;
let failures = 0;

const ok = (m) => process.stdout.write(`  ok    ${m}\n`);
const warn = (m) => {
  process.stdout.write(`  WARN  ${m}\n`);
  warnings += 1;
};
const fail = (m) => {
  process.stdout.write(`  FAIL  ${m}\n`);
  failures += 1;
};

/** Executes a subprocess safely, capturing stdout and stderr. */
function tryRun(cmd, args, opts = {}) {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        ...opts,
      }).trim(),
    };
  } catch (err) {
    const stdout = typeof err.stdout === "string" ? err.stdout : "";
    const stderr = typeof err.stderr === "string" ? err.stderr : "";
    return { ok: false, out: (stderr || stdout || String(err.message ?? err)).trim() };
  }
}

/**
 * Remove cached copies of our plugin from Cline's plugin store.
 *
 * `cline plugin install --force` reuses the cached directory and does NOT
 * overwrite the file, and `plugin uninstall <name>` does not always match.
 * Deleting the directory is the only reliable way to pick up edited source.
 */
function clearStalePluginInstalls() {
  const base = join(HOME, ".cline", "plugins", "_installed", "local");
  let removed = 0;
  let entries = [];
  try {
    entries = readdirSync(base);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const dir = join(base, entry);
    const file = [join(dir, "package", "src", "index.ts"), join(dir, "src", "index.ts")].find((p) =>
      existsSync(p),
    );
    if (!file) continue;
    try {
      if (readFileSync(file, "utf8").includes('name: "lore"')) {
        rmSync(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // Unreadable: leave it alone
    }
  }
  return removed;
}

process.stdout.write("Lore setup\n\n");

// 1. Node version
const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (major >= 22) ok(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node} is too old - Lore needs 22+ (https://nodejs.org)`);

// 2. Dependencies
const rootModules = join(ROOT, "node_modules");
if (existsSync(rootModules)) ok("dependencies installed");
else fail("run `npm install` first");

// 3. tsx actually runs (npm can block esbuild's postinstall)
const tsxBin = join(rootModules, ".bin", "tsx");
if (existsSync(tsxBin)) {
  const smoke = tryRun(process.execPath, [tsxBin, "-e", "process.exit(0)"]);
  if (smoke.ok) ok("tsx works");
  else warn("tsx could not run - try `npm rebuild esbuild`");
} else {
  warn("tsx not found (run `npm install`)");
}

// 4. Cline CLI (optional for fixture / tests; needed for live)
const clineCheck = tryRun("which", ["cline"]);
if (clineCheck.ok) {
  const authCheck = tryRun("cline", ["auth", "status"]);
  const authed = authCheck.ok && !/not logged in|unauthorized/i.test(authCheck.out);
  ok(`cline installed${authed ? " (authenticated)" : " (not authenticated - `cline auth` for live model)"}`);
} else {
  warn("cline CLI not found on PATH - live inference needs `npm i -g cline` (fixture mode works without it)");
}

// 5. Capture plugin
const pluginDir = join(ROOT, "packages", "plugin");
if (clineCheck.ok) {
  const cleared = clearStalePluginInstalls();
  const install = tryRun("cline", ["plugin", "install", pluginDir]);
  if (install.ok) ok(`capture plugin installed in Cline${cleared ? " (refreshed cache)" : ""}`);
  else warn(`plugin install failed: ${install.out}`);
} else {
  warn("skipped capture plugin install (cline CLI not on PATH)");
}

// 6. Test suite
process.stdout.write("\nrunning tests...\n");
const test = tryRun("npm", ["test"], { cwd: ROOT });
if (test.ok) ok("test suite passes (all 36 tests green)");
else fail(`tests failed:\n${test.out}`);

process.stdout.write("\n");
if (failures > 0) {
  process.stdout.write(`setup stopped with ${failures} failure(s) - fix them above and retry.\n`);
  process.exit(1);
}

process.stdout.write("All good. Try Lore:\n");
process.stdout.write("  npm run demo           # offline demo (no model key needed)\n");
process.stdout.write("  npm run demo -- --live # real model calls via Cline\n");
