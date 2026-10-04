#!/usr/bin/env node
/**
 * Lane 3 - Lore MCP server.
 *
 * A stdio JSON-RPC 2.0 server (newline-delimited) exposing the frozen Lore
 * tools. Zero dependencies so it runs anywhere node/tsx runs, including the
 * VS Code Cline extension where native plugins/hooks are unavailable.
 *
 *   search_lore      - search the local wiki
 *   get_adr          - read one ADR by id
 *   record_decision  - write a decision the agent just made
 *
 * Repo root: LORE_ROOT env var, else cwd. Logs go to stderr only.
 */
import { createStore, type RecordDecisionInput } from "@lore/core";

const ROOT = process.env.LORE_ROOT ?? process.cwd();
const store = createStore(ROOT);

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "search_lore",
    description:
      "Search the repository's local Lore wiki of architectural decisions (ADRs). Use this BEFORE changing code to learn why it is the way it is.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, e.g. 'config loading'" },
        limit: { type: "number", description: "Maximum results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_adr",
    description: "Read one architectural decision record from the local Lore wiki by id (e.g. ADR-0001).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ADR id, e.g. ADR-0001" } },
      required: ["id"],
    },
  },
  {
    name: "record_decision",
    description:
      "Record an architectural decision in the local Lore wiki. Call this when you make a non-obvious choice (a library, a pattern, a trade-off) so future sessions understand why.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        context: { type: "string", description: "The situation and constraints that forced a decision" },
        decision: { type: "string", description: "What was chosen" },
        alternatives: { type: "array", items: { type: "string" }, description: "Rejected options and why" },
        sources: { type: "array", items: { type: "string" } },
        confidence: { type: "number" },
      },
      required: ["title", "context", "decision"],
    },
  },
] as const;

function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  };
}

function callTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "search_lore": {
      const query = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 5;
      const results = store.searchAdrs(query, limit);
      return text(
        results.length === 0
          ? `No Lore ADRs match "${query}".`
          : results.map((r) => `${r.adrId}  ${r.title}\n${r.snippet}`).join("\n\n"),
      );
    }
    case "get_adr": {
      const id = String(args.id ?? "");
      const adr = store.readAdr(id);
      if (!adr) return text(`No ADR found with id "${id}".`);
      return text(`# ${adr.frontmatter.id}: ${adr.frontmatter.title}\n\n${adr.body}`);
    }
    case "record_decision": {
      const input = args as unknown as RecordDecisionInput;
      const config = store.readConfig();
      const maxId = store
        .allAdrFrontmatter()
        .reduce((acc, a) => Math.max(acc, Number(/ADR-(\d+)/.exec(a.id)?.[1] ?? 0)), 0);
      const id = `ADR-${String(maxId + 1).padStart(4, "0")}`;
      const alternatives = Array.isArray(input.alternatives) ? input.alternatives : [];
      const confidence = typeof input.confidence === "number" ? input.confidence : 0.7;
      const route: "wiki" | "drafts" =
        config.autonomy === "auto" && confidence >= config.confidenceThreshold ? "wiki" : "drafts";
      const written = store.writeAdr({
        route,
        confidence,
        adr: {
          frontmatter: {
            id,
            title: input.title,
            status: route === "wiki" ? "accepted" : "draft",
            date: new Date().toISOString().slice(0, 10),
            confidence,
            sources: input.sources ?? [],
            tags: [],
          },
          body: [
            `# ${id}: ${input.title}`,
            "",
            "## Context",
            "",
            input.context,
            "",
            "## Decision",
            "",
            input.decision,
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
    }
    default:
      throw { code: -32602, message: `unknown tool: ${name}` };
  }
}

function handle(request: JsonRpcRequest): Record<string, unknown> | null {
  const { id = null, method = "", params = {} } = request;

  // Notifications carry no id and get no reply.
  if (method.startsWith("notifications/")) return null;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: (params.protocolVersion as string) ?? "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "lore", version: "0.0.1" },
          },
        };
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": {
        const name = String(params.name ?? "");
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        return { jsonrpc: "2.0", id, result: callTool(name, args) };
      }
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
    }
  } catch (err) {
    const error = err as { code?: number; message?: string };
    return {
      jsonrpc: "2.0",
      id,
      error: { code: error.code ?? -32000, message: error.message ?? "internal error" },
    };
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  let index = buffer.indexOf("\n");
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line !== "") {
      try {
        const response = handle(JSON.parse(line) as JsonRpcRequest);
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      } catch {
        // ignore malformed lines
      }
    }
    index = buffer.indexOf("\n");
  }
});
process.stdin.on("end", () => process.exit(0));

process.stderr.write(`lore mcp: serving ${ROOT}\n`);
