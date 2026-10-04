#!/usr/bin/env node
/**
 * Lane 3 - Lore MCP server using the official @modelcontextprotocol/sdk.
 *
 * Exposes the frozen Lore tools over stdio:
 *   search_lore      - search the local wiki
 *   get_adr          - read one ADR by id
 *   record_decision  - write a decision the agent just made
 *
 * Repo root: LORE_ROOT env var, else cwd. Logs go to stderr only.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createStore, type RecordDecisionInput } from "@lore/core";

const ROOT = process.env.LORE_ROOT ?? process.cwd();
const store = createStore(ROOT);

const server = new McpServer({
  name: "lore",
  version: "0.0.1",
});

function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  };
}

// 1. search_lore
server.tool(
  "search_lore",
  "Search this repository's Lore wiki of architectural decision records (ADRs). ALWAYS call this BEFORE modifying code, so you know why it is the way it is. Use 2-5 distinctive keywords (a file name, a library, a concept). Returns matching ADR ids, titles and snippets.",
  {
    query: z.string().describe("2-5 distinctive keywords, e.g. 'config loading dotenv'"),
    limit: z.number().optional().describe("Maximum results (default 5)"),
  },
  async ({ query, limit = 5 }) => {
    const results = store.searchAdrs(query, limit);
    return text(
      results.length === 0
        ? `No Lore ADRs match "${query}".`
        : results.map((r) => `${r.adrId}  ${r.title}\n${r.snippet}`).join("\n\n"),
    );
  },
);

// 2. get_adr
server.tool(
  "get_adr",
  "Read one architectural decision record from the local Lore wiki by id (e.g. ADR-0001).",
  {
    id: z.string().describe("ADR id, e.g. ADR-0001"),
  },
  async ({ id }) => {
    const adr = store.readAdr(id);
    if (!adr) return text(`No ADR found with id "${id}".`);
    return text(`# ${adr.frontmatter.id}: ${adr.frontmatter.title}\n\n${adr.body}`);
  },
);

// 3. record_decision
server.tool(
  "record_decision",
  "Record an architectural decision you just made into this repository's Lore wiki. Call this when you: chose a library, pattern, data structure or format; rejected a plausible alternative after evaluating it; or discovered a constraint future work must respect. Always include the alternatives you rejected and WHY that is the most valuable part. Do not call it for trivial changes (formatting, typos, dependency bumps).",
  {
    title: z.string().describe("Imperative and specific, under 80 characters"),
    context: z.string().describe("The situation and constraints that forced a decision"),
    decision: z.string().describe("What was chosen, stated plainly"),
    alternatives: z
      .array(z.string())
      .optional()
      .describe("Rejected options, each with the reason it was rejected"),
    sources: z.array(z.string()).optional(),
    confidence: z
      .number()
      .optional()
      .describe("0..1 certainty that this captures the real reasoning"),
  },
  async ({ title, context, decision, alternatives = [], sources = [], confidence = 0.7 }) => {
    const config = store.readConfig();
    const maxId = store
      .allAdrFrontmatter()
      .reduce((acc, a) => Math.max(acc, Number(/ADR-(\d+)/.exec(a.id)?.[1] ?? 0)), 0);
    const id = `ADR-${String(maxId + 1).padStart(4, "0")}`;
    const route: "wiki" | "drafts" =
      config.autonomy === "auto" && confidence >= config.confidenceThreshold ? "wiki" : "drafts";

    const written = store.writeAdr({
      route,
      confidence,
      adr: {
        frontmatter: {
          id,
          title,
          status: route === "wiki" ? "accepted" : "draft",
          date: new Date().toISOString().slice(0, 10),
          confidence,
          sources,
          tags: [],
        },
        body: [
          `# ${id}: ${title}`,
          "",
          "## Context",
          "",
          context,
          "",
          "## Decision",
          "",
          decision,
          "",
          "## Alternatives considered",
          "",
          alternatives.length > 0 ? alternatives.map((a) => `- ${a}`).join("\n") : "- (none recorded)",
          "",
          "## Consequences",
          "",
          "(recorded by an agent via MCP; review and expand)",
        ].join("\n"),
      },
    });

    return text(`Recorded ${written.id} at ${written.path}`);
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`lore mcp: serving ${ROOT} via @modelcontextprotocol/sdk\n`);
}

main().catch((err) => {
  process.stderr.write(`lore mcp error: ${err.message}\n`);
  process.exit(1);
});
