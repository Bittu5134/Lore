/**
 * `lore mcp` - run or register the Lore MCP server.
 *
 *   lore mcp             run the server on stdio (manual wiring / debugging)
 *   lore mcp --install   register it in Cline's MCP config (~/.cline/mcp.json)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LORE_REPO = resolve(HERE, "..", "..", "..", "..");
const MCP_ENTRY = join(LORE_REPO, "packages", "mcp", "src", "index.ts");
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "";

interface McpConfig {
  mcpServers?: Record<string, unknown>;
}

export async function run(args: string[]): Promise<void> {
  const root = process.cwd();

  if (!existsSync(MCP_ENTRY)) {
    process.stderr.write(`lore: MCP entry not found at ${MCP_ENTRY}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.includes("--install")) {
    const configPath = join(HOME, ".cline", "mcp.json");
    let config: McpConfig = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, "utf8")) as McpConfig;
      } catch {
        process.stderr.write(`lore: ${configPath} is not valid JSON - leaving it untouched\n`);
        process.exitCode = 1;
        return;
      }
    }
    config.mcpServers = config.mcpServers ?? {};
    config.mcpServers.lore = {
      command: "npx",
      args: ["--yes", "tsx", MCP_ENTRY],
      env: { LORE_ROOT: root },
      autoApprove: ["search_lore", "get_adr", "record_decision"],
    };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    process.stdout.write(
      `lore: MCP server registered in ${configPath}\n` +
        `  root:   ${root}\n` +
        `  verify: cline config mcp --json\n` +
        `  VS Code: paste the same mcpServers.lore entry into the Cline MCP panel\n`,
    );
    return;
  }

  process.stderr.write(`lore mcp: starting stdio server for ${root}\n`);
  execFileSync("npx", ["--yes", "tsx", MCP_ENTRY], {
    stdio: "inherit",
    env: { ...process.env, LORE_ROOT: root },
  });
}
