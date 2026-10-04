/**
 * `lore link` - related repositories whose wikis you can search together.
 *
 *   lore link add <path>      register another Lore repository
 *   lore link remove <path>   unregister it
 *   lore link                 list links
 *
 * Pairs with `lore query <text> --all` for cross-project context.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LORE_PATHS } from "@lore/core";

export interface LinkRegistry {
  repos: string[];
}

export function registryPath(root: string): string {
  return join(root, LORE_PATHS.meta, "links.json");
}

export function readLinks(root: string): LinkRegistry {
  try {
    const parsed = JSON.parse(readFileSync(registryPath(root), "utf8")) as LinkRegistry;
    return { repos: Array.isArray(parsed.repos) ? parsed.repos : [] };
  } catch {
    return { repos: [] };
  }
}

function writeLinks(root: string, registry: LinkRegistry): void {
  mkdirSync(join(root, LORE_PATHS.meta), { recursive: true });
  writeFileSync(registryPath(root), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

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
