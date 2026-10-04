#!/usr/bin/env node
/**
 * lore - CLI entry point.
 *
 * Command dispatch is dynamic: each command lives in ./commands/<name>.ts and
 * exports `run(args: string[]): Promise<void>`. Lanes own their own command
 * files, so parallel edits never collide on this dispatcher.
 */
import { fileURLToPath } from "node:url";

// Piping into `head`/`grep` closes stdout early - that is not an error worth a stack trace.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
});
process.stderr.on("error", () => {
  // stderr is gone; nothing useful to report
});

export const KNOWN_COMMANDS = [
  "status",
  "init",
  "compile",
  "query",
  "sync",
  "backfill",
  "watch",
  "hook",
  "share",
  "pull",
  "reconcile",
  "review",
  "supersede",
  "index",
  "audit",
  "digest",
  "graph",
  "link",
  "rollup",
  "doctor",
  "mcp",
] as const;
export type LoreCommand = (typeof KNOWN_COMMANDS)[number];

const HELP = `lore - remembers WHY your code is the way it is

GETTING STARTED (this is the whole product)

  1.  lore init                 once, in your repository - sets up everything
  2.  ...just work normally...  Cline sessions are captured by the plugin,
                                commits are documented by the git hook, and
                                decisions are written automatically when a run ends.
                                You run NOTHING on a normal day.
  3.  lore query <words>        ask why something is the way it is

  Read the results: .lore/wiki/  (index.md lists every decision)

EVERYDAY (3 commands are enough)
  init [--no-hooks]           Create .lore/ and install git hooks + the agent rule
  compile [--fixture]         Manually distil new evidence (--fixture = offline, no model call)
  query <words> [--all]       Search the wiki (--all = linked repos too)
  status                      The dashboard: what Lore saw, decided, and is waiting on
  doctor                      Something feels off? Checks everything, prints fixes

THE REST (only when you need it)
  sync [--auto]               Commit -> ADR (what the post-commit hook runs for you)
  backfill [--full]           Document an existing repository's history, in batches
  watch                       Capture the human editing session between commits
  review [id|--all]           Promote draft ADRs into the accepted wiki
  supersede <id> [--by <id>]  Retire a decision, citing its replacement
  index                       Rebuild wiki/index.md + the SQLite search index
  audit                       Scan evidence and wiki for secrets (exit 1: CI-safe)
  digest [--limit N]          Markdown summary of recent decisions (for PRs)
  graph                       One-file HTML graph of the wiki
  link add|remove <path>      Link related repos; search them with query --all
  rollup [--month YYYY-MM]    Summarise a period into a theme ADR (dry run default)
  share [--out <file>]        Export the wiki as a portable bundle for a teammate
  pull <bundle.json>          Import a bundle from a teammate
  reconcile                   After a git merge: repair divergent wiki edits, keep both
  mcp [--install]             Run the MCP server, or register it with Cline
  hook <event>                Internal: capture adapter for Cline hook payloads

Docs: README.md (start here)  |  DEMO.md (60-second version)  |  docs/scaling.md
`;

function assertNode(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (!Number.isFinite(major) || major < 22) {
    process.stderr.write(
      `lore: Node ${process.versions.node} is too old - Lore needs Node 22 or newer\n` +
        `      (recursive fs.watch, node:test). Install from https://nodejs.org\n`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertNode();
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  // Bare `lore` -> the dashboard. `help` / --help -> the layered manual.
  if (!cmd || cmd === "status") {
    const mod = (await import(new URL("./commands/status.ts", import.meta.url).href)) as {
      run?: (args: string[]) => Promise<void>;
    };
    await mod.run?.([]);
    process.exit(0);
  }
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (cmd === "--version" || cmd === "-V") {
    process.stdout.write("lore 0.0.1\n");
    process.exit(0);
  }
  if (!(KNOWN_COMMANDS as readonly string[]).includes(cmd)) {
    process.stderr.write(`lore: unknown command "${cmd}" - try \`lore help\`\n`);
    process.exit(1);
  }

  const url = new URL(`./commands/${cmd}.ts`, import.meta.url).href;
  try {
    const mod = (await import(url)) as { run?: (args: string[]) => Promise<void> };
    if (typeof mod.run !== "function") {
      throw new Error(`command module "${cmd}" does not export run()`);
    }
    await mod.run(rest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ERR_MODULE_NOT_FOUND") {
      process.stderr.write(
        `lore: command "${cmd}" is not implemented yet - see packages/cli/SPEC.md\n`,
      );
      process.exit(1);
    }
    process.stderr.write(`lore: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  void main();
}
