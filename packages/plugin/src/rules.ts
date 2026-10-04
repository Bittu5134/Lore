import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Continuity injection: instead of hoping the model reads `.clinerules`, the
 * plugin registers a rule containing the repository's decision index, so every
 * session starts already knowing what was decided here.
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
    "",
    "## Known decisions",
    "",
    known,
  ].join("\n");
}
