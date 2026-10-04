#!/usr/bin/env node
/**
 * lore - CLI entry point.
 *
 * Command dispatch is dynamic: each command lives in ./commands/<name>.ts and
 * exports `run(args: string[]): Promise<void>`. Lanes own their own command
 * files, so parallel edits never collide on this dispatcher.
 */
import { fileURLToPath } from "node:url";

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
  "doctor",
  "mcp",
] as const;
export type LoreCommand = (typeof KNOWN_COMMANDS)[number];

const HELP = `lore - local architectural knowledge engine

Usage: lore <command> [options]

Commands:
  init                      Create .lore/ in this repo and install git hooks
  hook <event>              Consume a Cline hook payload from stdin (capture)
  sync [--auto]             Compile new commits/sessions since the cursor
  backfill [--full]         Replay git history through the compiler
  watch                     Watch the working tree and capture edit sessions
  compile [--last]          Compile the latest raw session into an ADR
  query <text>              Search the local wiki
  share [--out <file>]      Export the wiki as a portable bundle
  pull <file>               Import a wiki bundle from another contributor
  reconcile                 Merge divergent wiki edits after a merge
  mcp [--install]           Run/register the Lore MCP server
  doctor                    Diagnose the Lore installation
`;

async function main(): Promise<void> {
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
