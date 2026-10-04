#!/usr/bin/env node
/**
 * `npm run demo` - the hackathon demo in ONE command.
 *
 * Self-narrating, zero typing for the presenter. Offline by default (uses the
 * fixture pipeline, no model call needed). Pass --live to run a real Cline
 * session if the CLI is authenticated.
 *
 *   npm run demo           # offline, works anywhere
 *   npm run demo -- --live # real model calls (needs `cline auth`)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "packages", "cli", "src", "index.ts");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const DEMO = "/tmp/lore-demo";
const live = process.argv.includes("--live");

const say = (text) => process.stdout.write(`\n\x1b[1mSAY:\x1b[0m ${text}\n`);
const beat = (title) => process.stdout.write(`\n\x1b[36m\x1b[1m── ${title} ──\x1b[0m\n`);
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", cwd: DEMO, ...opts });
const lore = (args) => run(process.execPath, [TSX, CLI, ...args]);

function step(title, text) {
  beat(title);
  if (text) say(text);
}

try {
  beat("0 · setup");
  rmSync(DEMO, { recursive: true, force: true });
  mkdirSync(DEMO, { recursive: true });
  process.stdout.write(`playground: ${DEMO}\n`);
  run("git", ["init", "-q"], { cwd: DEMO });

  step(
    "1 · one command sets everything up",
    "lore init creates the knowledge store, installs the git hooks, and writes the agent rule.",
  );
  lore(["init"]);

  step(
    "2 · an agent (or a human) does real work",
    live
      ? "Cline is editing the code. Lore is recording its reasoning live."
      : "(offline mode) I'm seeding a captured agent session — with --live this would be a real Cline run.",
  );
  writeFileSync(join(DEMO, "config.ts"), "export const DEFAULT_CONFIG = { port: 3000 };\n");

  if (live) {
    run(
      "cline",
      [
        "-p",
        "make the config loader accept an APP_CONFIG environment override; keep the JSON file as the single source of truth",
        "--cwd",
        DEMO,
      ],
    );
  } else {
    mkdirSync(join(DEMO, ".lore", "raw"), { recursive: true });
    execFileSync("cp", [
      join(ROOT, "packages", "core", "fixtures", "session.sample.jsonl"),
      join(DEMO, ".lore", "raw", "session.jsonl"),
    ]);
    process.stdout.write("(seeded a captured session — real capture writes this live)\n");
  }

  step(
    "3 · the decision writes itself",
    "Watch: no commands. The session ended, so Lore is compiling it into a decision record on its own.",
  );
  if (live) {
    // auto-compile is async; give it a moment, then show what appeared
    process.stdout.write("(waiting a few seconds for the background compile…)\n");
    await new Promise((r) => setTimeout(r, 15000));
  } else {
    lore(["compile"]);
  }

  step("4 · this is what Lore captured", "Context. Decision. The alternatives that were REJECTED and why. That's the part a git diff can never tell you.");
  try {
    lore(["query"]);
  } catch {
    process.stdout.write("(wiki still empty - run `lore compile` in the playground)\n");
  }

  step(
    "5 · humans too — zero AI involved",
    "This commit was made by hand. The post-commit hook documents it on its own.",
  );
  writeFileSync(join(DEMO, "config.ts"), "export const DEFAULT_CONFIG = { port: 3000, retries: 3 };\n");
  run("git", ["add", "-A"]);
  run("git", ["-c", "user.email=dev@demo.dev", "-c", "user.name=Demo", "commit", "-q", "-m", "feat: add retry count to the default config"]);
  if (live) {
    process.stdout.write("\n(waiting for the post-commit hook to run lore sync…)\n");
    await new Promise((r) => setTimeout(r, 20000));
  } else {
    // offline: run the same pipeline the hook would run, with the fixture
    process.stdout.write("\n(offline: running the same sync the hook runs, with the fixture)\n");
    lore(["sync", "--fixture"]);
  }
  run("ls", [join(DEMO, ".lore", "wiki")]);

  step(
    "6 · it documents itself",
    "Lore's own repository wiki was written by Lore while we built Lore.",
  );
  try {
    execFileSync("cat", [join(ROOT, ".lore", "wiki", "index.md")], { stdio: "inherit" });
  } catch {
    // no wiki in the host repo yet: fine for the demo
  }

  beat("done");
  say(
    "Local knowledge, captured from agents AND humans, compiled automatically, and searchable from any tool. The why is never lost again.",
  );
  process.stdout.write(`\nPlayground kept at ${DEMO} — explore with: npx --yes tsx ${CLI} status\n`);
} catch (err) {
  process.stderr.write(`\ndemo failed: ${(err && err.message) || err}\n`);
  process.stderr.write(`\nOffline fallback: npm run demo (without --live) needs nothing but Node.\n`);
  process.exitCode = 1;
}
