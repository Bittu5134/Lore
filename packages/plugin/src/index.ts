/**
 * @fileoverview Lore Cline Capture & Continuity Plugin Entrypoint.
 *
 * @description
 * Integrates Lore directly into the Cline agent lifecycle via `@cline/sdk`:
 * 1. `setup()`: Injects the architectural continuity rule into agent working memory
 *    and dynamically registers the Lore MCP server.
 * 2. `hooks.onEvent()`: Streams live agent reasoning deltas, tool executions,
 *    and run completions straight into Lore's append-only telemetry logs (`.lore/raw/`).
 *
 * This provides the unique "in-flight reasoning" capture capability that static
 * code analyzers and git diff tools can never observe.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LorePluginApi, RuntimeEventLike } from "./types.ts";
import { loreRoot, readLoreConfig } from "./compile.ts";
import { continuityRule } from "./rules.ts";
import { capture, toRecord } from "./capture.ts";

export * from "./types.ts";
export * from "./redact.ts";
export * from "./compile.ts";
export * from "./rules.ts";
export * from "./capture.ts";

const lorePlugin = {
  name: "lore",
  manifest: {
    capabilities: ["hooks", "rules", "mcp"],
  },
  setup(api: LorePluginApi): void {
    const root = loreRoot();
    // Opt-in: stay completely inert in repositories that never ran `lore init`.
    if (!existsSync(join(root, ".lore", "config.json"))) return;

    // 1. Continuity injection - every session starts knowing what was decided here.
    api.registerRule?.({
      id: "lore-continuity",
      source: "lore",
      content: () => continuityRule(root),
    });

    // 2. Register the Lore MCP server so any client (including the VS Code
    //    extension) gets search_lore / get_adr / record_decision without a
    //    manual config edit. `lore init` records where Lore lives.
    const loreHome = readLoreConfig(root)?.loreHome;
    if (loreHome) {
      const mcpEntry = join(loreHome, "packages", "mcp", "src", "index.ts");
      if (existsSync(mcpEntry)) {
        api.registerMcpServer?.({
          name: "lore",
          transport: {
            type: "stdio",
            command: "npx",
            args: ["--yes", "tsx", mcpEntry],
            cwd: root,
            env: { LORE_ROOT: root },
          },
        });
      }
    }
  },
  hooks: {
    onEvent(event: unknown): void {
      capture(event as RuntimeEventLike);
    },
  },
};

export default lorePlugin;
export { capture as captureRuntimeEvent, toRecord as runtimeEventToRecord };
