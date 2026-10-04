#!/usr/bin/env node
/**
 * @fileoverview `npm run demo` — Interactive Self-Narrating Hackathon Demo.
 *
 * @description
 * Automated product demonstration showcasing the complete Lore architectural memory loop.
 *
 * Demo Scenario:
 *  - Step 0: Initializes an isolated sandbox repository in `/tmp/lore-demo`.
 *  - Step 1: Executes `lore init` (creates `.lore/`, installs git hooks, registers continuity rules).
 *  - Step 2: Simulates developer/agent activity (seeding live reasoning or offline fixtures).
 *  - Step 3: Demonstrates autonomous compilation (decisions synthesized without manual intervention).
 *  - Step 4: Interrogates the generated wiki (`lore query`).
 *  - Step 5: Demonstrates human commit capture via git hooks (zero AI required).
 *  - Step 6: Visualizes the architectural decision graph (`lore graph`).
 *
 * Modes:
 *  - `npm run demo`: Fully offline; uses fixtures and requires no API keys or model accounts.
 *  - `npm run demo -- --live`: Live demonstration invoking real Cline models.
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
    // Auto-compile is async; give it a moment, then show what appeared
    process.stdout.write("(waiting a few seconds for the background compile…)\n");
    await new Promise((r) => setTimeout(r, 15000));
  } else {
    lore(["compile", "--fixture"]);
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
    process.stdout.write("(post-commit hook is running in the background…)\n");
    await new Promise((r) => setTimeout(r, 10000));
  } else {
    lore(["sync", "--fixture"]);
  }

  step("6 · the decision graph", "Every ADR links to what it supersedes and what shares its tags. An HTML graph you can open in a browser.");
  lore(["graph"]);
  process.stdout.write(`  view graph: file://${DEMO}/.lore/wiki/graph.html\n`);

  beat("end of demo");
  say("That's Lore. Git records what changed. Lore records why.");
} catch (err) {
  process.stderr.write(`demo failed: ${err.message}\n`);
  process.exit(1);
}
