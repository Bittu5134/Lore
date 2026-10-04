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

const HELP = `lore - local architectural knowledge engine

Usage: lore <command> [options]

Commands:
  init [--no-hooks]         Create .lore/ and install git hooks + the agent rule
  hook <event>              Consume a Cline hook payload from stdin (capture)
  sync [--auto]             Compile commits since the cursor (post-commit hook)
  backfill [--full]         Replay git history through the compiler
  watch                     Capture the human editing session between commits
  compile [--fixture]       Compile new evidence into ADRs (offline with --fixture)
  query <text> [--all]      Search the wiki (--all = linked repos too)
  review [id|--all]         Triage drafts into the accepted wiki
  supersede <id> [--by <id>]  Retire a decision, linking its replacement
  index                     Rebuild wiki/index.md + the SQLite FTS search index
  audit                     Scan raw evidence and the wiki for secrets
  digest [--limit N]        Markdown digest of recent decisions (for CI/PRs)
  graph                     Write a self-contained HTML graph of the wiki
  link [add|remove <path>]  Manage related repositories you search together
  rollup [--month YYYY-MM] [--write]  Synthesise a theme ADR from a period
  share [--out <file>]      Export the wiki as a portable bundle
  pull <file>               Import a wiki bundle from another contributor
  reconcile                 Merge divergent wiki edits after a merge
  mcp [--install]           Run/register the Lore MCP server
  doctor                    Diagnose the whole installation, with fixes
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

  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    process.exit(cmd ? 0 : 1);
  }
  if (cmd === "--version" || cmd === "-V") {
    process.stdout.write("lore 0.0.1\n");
    process.exit(0);
  }
  if (!(KNOWN_COMMANDS as readonly string[]).includes(cmd)) {
    process.stderr.write(`lore: unknown command "${cmd}"\n\n${HELP}`);
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
