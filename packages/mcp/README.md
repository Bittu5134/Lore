# @lore/mcp — Lore MCP server

A zero-dependency stdio JSON-RPC 2.0 server exposing the Lore wiki to **any MCP client**,
including the Cline VS Code extension (where native plugins/hooks are not yet available).

## Tools

| Tool | Purpose |
|---|---|
| `search_lore` | Search the local wiki of ADRs — call before changing code |
| `get_adr` | Read one ADR by id (`ADR-0001`) |
| `record_decision` | Record a decision the agent just made |

## Run

```bash
LORE_ROOT=/path/to/repo npx --yes tsx /abs/path/to/packages/mcp/src/index.ts
```

Root resolution: `LORE_ROOT` env, else the process cwd. Logs go to stderr only.

## Register with Cline

**CLI** — add to `~/.cline/mcp.json` (or run `cline mcp` and paste the entry):

```json
{
  "mcpServers": {
    "lore": {
      "command": "npx",
      "args": ["--yes", "tsx", "/abs/path/to/repo/packages/mcp/src/index.ts"],
      "env": { "LORE_ROOT": "/abs/path/to/repo" },
      "autoApprove": ["search_lore", "get_adr"]
    }
  }
}
```

**VS Code extension** — open the Cline panel → MCP Servers → Configure MCP Servers, and add the same
`mcpServers.lore` entry. Verify with `cline config mcp --json`.

## Manual smoke test

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_lore","arguments":{"query":"config"}}}' \
| npx --yes tsx packages/mcp/src/index.ts
```
