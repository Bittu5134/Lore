/**
 * @fileoverview Dynamic Continuity Rule Generator for Cline Sessions.
 *
 * @description
 * Builds the dynamic system prompt rule injected into Cline coding sessions.
 *
 * In conventional agent systems, agents start with zero historical context, frequently
 * reversing past architectural consensus or re-litigating settled trade-offs.
 *
 * Lore's continuity rule directly injects the top ADRs from `.lore/wiki/` into the
 * agent's working memory at session start. This guarantees:
 * 1. The agent immediately knows which architectural constraints are already established.
 * 2. The agent is directed to use `search_lore` or read relevant ADRs before modifying code.
 * 3. The agent is prompted to call `record_decision` when making novel design choices.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Compiles the active decision catalog into a concise markdown instruction block.
 *
 * @param root Absolute path to the repository root.
 * @returns Complete rule text ready for injection via `api.registerRule()`.
 */
export function continuityRule(root: string): string {
  const wiki = join(root, ".lore", "wiki");
  let titles: string[] = [];
  try {
    if (existsSync(wiki)) {
      titles = readdirSync(wiki)
        .filter((f) => /^ADR-\d{4}-.*\.md$/.test(f))
        .slice(0, 40)
        .map((file) => {
          const text = readFileSync(join(wiki, file), "utf8");
          const id = /^id:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? file.slice(0, 8);
          const title = /^title:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? file;
          return `- ${id}: ${title}`;
        });
    }
  } catch {
    titles = [];
  }

  const known = titles.length > 0 ? titles.join("\n") : "(the wiki is empty so far)";
  return [
    "# Lore — Architectural Memory",
    "",
    "This repository keeps its architectural decision records (ADRs) in `.lore/wiki/`.",
    "They record WHY the code is the way it is.",
    "",
    "Before editing: read the decision index below, then open the 1-3 ADRs that match your task",
    "(read at most 3 - respect the context budget). If you contradict a recorded decision, say so",
    "explicitly in your final answer. When you make a non-obvious choice, record it: call the",
    "`record_decision` tool if the Lore MCP server is available, otherwise write an ADR into",
    "`.lore/drafts/` using `.lore/wiki/ADR-0000-template.md` (include the alternatives you rejected).",
    "Never edit `.lore/raw/` or `.lore/meta/`.",
    "If the user explicitly states a change is non-trivial or significant, record it with",
    "`record_decision` even when it looks small, and note in Consequences that the user flagged it.",
    "",
    "## Known decisions",
    "",
    known,
  ].join("\n");
}
