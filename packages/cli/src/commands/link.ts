/**
 * @fileoverview `lore link` Command Implementation.
 *
 * @description
 * Manages relationships between multiple repositories on the local filesystem.
 * Enables federated, cross-repository architectural queries via `lore query <words> --all`.
 *
 * Commands:
 *  - `lore link add <path>`: Validates and registers a foreign Lore-enabled repository.
 *  - `lore link remove <path>`: Unregisters a linked repository.
 *  - `lore link`: Lists all active repository links.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LORE_PATHS } from "@lore/core";

/** Registry structure tracking linked repository filepaths. */
export interface LinkRegistry {
  repos: string[];
}

/** Computes absolute path to `.lore/meta/links.json`. */
export function registryPath(root: string): string {
  return join(root, LORE_PATHS.meta, "links.json");
}

/** Reads the list of linked repository directories safely. */
export function readLinks(root: string): LinkRegistry {
  try {
    const parsed = JSON.parse(readFileSync(registryPath(root), "utf8")) as LinkRegistry;
    return { repos: Array.isArray(parsed.repos) ? parsed.repos : [] };
  } catch {
    return { repos: [] };
  }
}

/** Writes the linked repositories list to `.lore/meta/links.json`. */
function writeLinks(root: string, registry: LinkRegistry): void {
  mkdirSync(join(root, LORE_PATHS.meta), { recursive: true });
  writeFileSync(registryPath(root), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

/**
 * Executes the `lore link` command.
 *
 * @param args Command line arguments (`add <path>`, `remove <path>`, `list`).
 */
export async function run(args: string[]): Promise<void> {
  const root = process.cwd();
  const sub = args[0] ?? "list";
  const target = args[1] ? resolve(root, args[1]) : undefined;
  const registry = readLinks(root);

  if (sub === "add") {
    if (!target) {
      process.stderr.write("usage: lore link add <path-to-another-lore-repo>\n");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(join(target, LORE_PATHS.config))) {
      process.stderr.write(
        `lore: ${target} is not a Lore repository (no .lore/config.json) — run \`lore init\` there first\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (!registry.repos.includes(target)) registry.repos.push(target);
    writeLinks(root, registry);
    process.stdout.write(`lore: linked ${target} (${registry.repos.length} linked repo(s))\n`);
    process.stdout.write("  search across them with: lore query <text> --all\n");
    return;
  }

  if (sub === "remove") {
    if (!target) {
      process.stderr.write("usage: lore link remove <path>\n");
      process.exitCode = 1;
      return;
    }
    registry.repos = registry.repos.filter((repo) => repo !== target);
    writeLinks(root, registry);
    process.stdout.write(`lore: unlinked ${target} (${registry.repos.length} remaining)\n`);
    return;
  }

  if (registry.repos.length === 0) {
    process.stdout.write("lore: no linked repositories\n  add one with: lore link add <path>\n");
    return;
  }
  process.stdout.write(`lore: ${registry.repos.length} linked repo(s)\n`);
  for (const repo of registry.repos) {
    process.stdout.write(`  ${repo}${existsSync(repo) ? "" : "  (missing on disk)"}\n`);
  }
}
