#!/usr/bin/env node
/**
 * `npm run setup` - the single command a judge can run on a fresh clone.
 *
 * Verifies the environment, installs the Cline capture plugin, runs the test
 * suite, and prints precisely what is missing. Optional pieces (Cline itself,
 * auth) only warn - the fixture path works without them.
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
      // unreadable: leave it alone
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

// 4. Cline CLI (optional but needed for real inference)
const cline = tryRun("cline", ["--version"]);
if (cline.ok) ok(`cline CLI v${cline.out.replace(/^v/, "")}`);
else warn("cline CLI not found - install with `npm i -g cline` (or use `compile --fixture`)");

// 5. Cline auth
const providers = join(HOME, ".cline", "data", "settings", "providers.json");
if (!cline.ok) {
  warn("skipping the auth check (no cline CLI)");
} else if (existsSync(providers)) {
  let configured = false;
  try {
    const parsed = JSON.parse(readFileSync(providers, "utf8"));
    configured = Boolean(parsed && parsed.providers && Object.keys(parsed.providers).length > 0);
  } catch {
    configured = false;
  }
  if (configured) ok("cline is authenticated");
  else warn("cline has no provider configured - run `cline auth` (or use `compile --fixture`)");
} else {
  warn("cline has no provider configured - run `cline auth` (or use `compile --fixture`)");
}

// 6. Capture plugin
// NOTE: `cline plugin install --force` reuses its cached directory and does NOT
// overwrite the file, so an edited plugin would silently stay stale. Always clear
// the old copy first.
if (cline.ok) {
  const cleared = clearStalePluginInstalls();
  if (cleared > 0) ok(`cleared ${cleared} cached plugin copy (installs do not overwrite)`);
  const install = tryRun("cline", ["plugin", "install", join(ROOT, "packages", "plugin")]);
  if (install.ok) ok("capture plugin installed");
  else warn(`plugin install failed: ${install.out.split("\n")[0]}`);
} else {
  warn("skipping plugin install (no cline CLI)");
}

// 7. Test suite
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const tests = tryRun(npm, ["test", "--silent"], { cwd: ROOT, shell: process.platform === "win32" });
if (tests.ok) ok("test suite passes");
else warn("`npm test` did not pass - run it directly to see details");

// 8. Sanity: the CLI itself runs
const cli = join(ROOT, "packages", "cli", "src", "index.ts");
const version = tryRun(process.execPath, [tsxBin, cli, "--version"]);
if (version.ok) ok(`lore cli runnable (${version.out})`);
else warn("lore cli did not run - see README troubleshooting");

process.stdout.write(
  `\n${failures === 0 ? "setup ok" : "setup incomplete"}` +
    `${warnings > 0 ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}\n\n` +
    "Next steps:\n" +
    "  1. prove the pipeline offline:   see README.md 'Quickstart' (uses `compile --fixture`)\n" +
    "  2. use it on a repo:             cd <repo> && npx --yes tsx " +
    join(ROOT, "packages", "cli", "src", "index.ts") +
    " init\n" +
    "  3. full judge walkthrough:       DEMO.md\n" +
    "  4. check anything:               npx --yes tsx " +
    join(ROOT, "packages", "cli", "src", "index.ts") +
    " doctor\n",
);

process.exit(failures === 0 ? 0 : 1);
