#!/usr/bin/env node
/**
 * @fileoverview Lore MCP (Model Context Protocol) Server.
 *
 * @description
 * Implements a standards-compliant Model Context Protocol server using the official
 * `@modelcontextprotocol/sdk`. Connects external AI coding agents (Cline, Claude Desktop,
 * Cursor, Windsurf, Zed) directly to the repository's living architectural wiki.
 *
 * Exposes three primary tools:
 * 1. `search_lore`: Semantic & keyword retrieval over ADRs. Allows agents to query
 *    prior constraints before modifying unfamiliar codebases.
 * 2. `get_adr`: Complete retrieval of an individual ADR document by ID.
 * 3. `record_decision`: Direct write access allowing agents to commit new architectural
 *    decisions into `.lore/wiki/` or `.lore/drafts/`.
 *
 * Transport: stdio JSON-RPC.
 * All diagnostic logs strictly route to stderr to keep stdout pure for RPC frames.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createStore, type RecordDecisionInput } from "@lore/core";

// Determine repository root: LORE_ROOT environment variable, or fallback to cwd.
const ROOT = process.env.LORE_ROOT ?? process.cwd();
const store = createStore(ROOT);

// Initialize official Model Context Protocol server instance
const server = new McpServer({
  name: "lore",
  version: "0.0.1",
});

/**
 * Wraps textual content in MCP's standard tool response structure.
 *
 * @param value Text string or object to serialize into content blocks.
 * @returns Standard MCP content array payload.
 */
function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  };
}

// ---------------------------------------------------------------------------
// 1. Tool: search_lore
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 2. Tool: get_adr
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 3. Tool: record_decision
// ---------------------------------------------------------------------------
server.tool(
  "record_decision",
  "Record an architectural decision you just made into this repository's Lore wiki. Call this when you: chose a library, pattern, data structure or format; rejected a plausible alternative after evaluating it; or discovered a constraint future work must respect. Always include the alternatives you rejected and WHY that is the most valuable part. Do not call it for trivial changes (formatting, typos, dependency bumps) — UNLESS the user explicitly states that the change is non-trivial or significant: then record it anyway, and state in Consequences that the user flagged it, because their call outranks your own read of how small the diff looks. A user flag is an override of the size heuristic, not of the honesty requirements — never invent alternatives you did not actually consider.",
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

    store.regenerateIndex();
    return text(`Recorded ${written.id} in ${written.path} (${route === "wiki" ? "accepted" : "draft"}).`);
  },
);

// ---------------------------------------------------------------------------
// Server Startup & Transport Binding
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[lore-mcp] server listening on stdio (root: ${ROOT})\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`[lore-mcp] fatal error: ${String(err)}\n`);
  process.exit(1);
});
