---
id: ADR-0012
title: Adopt official @modelcontextprotocol/sdk for the MCP server
status: accepted
date: 2026-10-04
confidence: 0.95
sources:
  - 4ac35f0a
tags:
  - mcp
  - sdk
  - dependency
  - supersession
---

# ADR-0012: Adopt official @modelcontextprotocol/sdk for the MCP server

## Context

ADR-0005 previously chose a hand-rolled, zero-dependency stdio JSON-RPC server for Lore to avoid an SDK dependency. Commit 4ac35f0a rewrites packages/mcp/src/index.ts (~290 lines changed) onto the official SDK, adding @modelcontextprotocol/sdk ^1.32.0 and zod ^3.25.76 to @lore/mcp.

## Decision

Replace the hand-rolled protocol layer with McpServer + StdioServerTransport from @modelcontextprotocol/sdk, declaring the three frozen tools (search_lore, get_adr, record_decision) with zod schemas while leaving the @lore/core store logic untouched. Also set loreHome in .lore/config.json so the plugin can auto-register the server via api.registerMcpServer (npx tsx) without manual client config.

## Alternatives considered

- Keep the hand-rolled stdio JSON-RPC server per ADR-0005 — rejected: the official SDK now provides maintained protocol compliance, tool registration, and transport handling
- Stay fully dependency-free — rejected: the lockfile already grows ~5000 lines, and SDK validation/transport outweighs the zero-dep goal

## Consequences

Lockfile and node_modules grow substantially, but the server gains protocol compliance, maintained stdio transport, and zod-based input validation; ADR-0005's zero-dependency stance is abandoned and Cline/VS Code clients can discover the tools automatically via loreHome.

## Supersedes

ADR-0005

<!-- SOURCES: 4ac35f0a -->
