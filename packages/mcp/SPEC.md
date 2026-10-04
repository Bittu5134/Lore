# SPEC — Lane 3: MCP server (`@lore/mcp`)

## Goal
Expose the wiki to ANY MCP client (including the VS Code Cline extension, where plugins don't work)
via a stdio MCP server. This is the "not locked in" lane.

## Deliverables
- `src/index.ts` — stdio MCP server implementing the three frozen tools:
  | Tool | Input | Output |
  |---|---|---|
  | `search_lore` | `SearchLoreInput` | `SearchLoreOutput` |
  | `get_adr` | `GetAdrInput` | `GetAdrOutput` |
  | `record_decision` | `RecordDecisionInput` | `RecordDecisionOutput` |
  Use `@modelcontextprotocol/sdk` if `npm install` works; otherwise a hand-rolled JSON-RPC 2.0
  stdio loop (`initialize`, `tools/list`, `tools/call`) — the protocol surface we need is small.
- `src/tools.ts` — thin wrappers over `@lore/core` store (`searchAdrs`, `readAdr`, `writeAdr`)
- `test/mcp.test.ts` — spawn the server, speak JSON-RPC over stdin/stdout, assert:
  1. `tools/list` returns exactly the 3 tool names
  2. `get_adr` for a written sample ADR returns the parsed `Adr`
  3. `search_lore` for "dotenv" finds the fixture ADR

## Runtime
- Repo root resolved from `LORE_ROOT` env, else `process.cwd()`.
- Start with: `npx tsx packages/mcp/src/index.ts` (stdin/stdout JSON-RPC; logs → stderr only).

## Registration (the payoff)
- Add `mcp` handling or document the JSON: append to Cline's MCP config
  (`~/.cline/mcp.json` for CLI, panel JSON for the VS Code extension):
  ```json
  { "mcpServers": { "lore": {
      "command": "npx", "args": ["--yes", "tsx", "<abs>/packages/mcp/src/index.ts"],
      "env": { "LORE_ROOT": "<abs repo>" }, "autoApprove": ["search_lore", "get_adr"] } } }
  ```
- Verify with `cline config mcp --json`.

## Boundaries
- Edit only `packages/mcp/**` (+ adding a root dependency if you use the official SDK).

## Acceptance
`npx tsx --test packages/mcp/test/*.test.ts` passes, and `cline config mcp --json` lists `lore`.
