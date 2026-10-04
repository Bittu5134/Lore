---
id: ADR-0005
title: Hand-roll a zero-dependency stdio JSON-RPC MCP server for Lore instead of adopting the official MCP SDK
status: accepted
date: 2026-10-04
confidence: 0.78
sources:
  - git commit c9d67db3
  - packages/mcp/src/index.ts
  - packages/mcp/README.md
  - packages/mcp/SPEC.md
  - packages/core/src/store.ts
  - packages/core/src/index.ts
  - PLAN.md
  - .lore/wiki/ADR-0001-layer-lore-as-one-core-plus-thin-adapters-native-hooks-captu.md
  - c9d67db3
tags:
  - mcp
  - stdio
  - json-rpc
  - zero-dependency
  - portability
  - cline
  - record_decision
  - drafts-gating
  - tools
---

# ADR-0005: Hand-roll a zero-dependency stdio JSON-RPC MCP server for Lore instead of adopting the official MCP SDK

## Context

Lore's portable query surface (Lane 3, `@lore/mcp`) exists to expose the local `.lore/` wiki to ANY MCP client — explicitly including the VS Code Cline extension where native plugins/hooks do not work (packages/mcp/SPEC.md: 'Expose the wiki to ANY MCP client ... This is the "not locked in" lane'; PLAN.md §6 lists MCP stdio server as the portable Query/API layer, because MCP tools cannot capture the in-flight reasoning stream that native hooks do). The server must expose exactly three frozen tools — `search_lore`, `get_adr`, `record_decision` — over stdio, be launchable from a client-registered command (`npx --yes tsx <abs>/packages/mcp/src/index.ts`), resolve the repo root from `LORE_ROOT` else `process.cwd()`, and keep stdout pure so stdin/stdout carry JSON-RPC while logs go to stderr only. The lane SPEC framed the build as a choice: 'Use `@modelcontextprotocol/sdk` if `npm install` works; otherwise a hand-rolled JSON-RPC 2.0 stdio loop (`initialize`, `tools/list`, `tools/call`) — the protocol surface we need is small.'

## Decision

Implement `packages/mcp/src/index.ts` as a zero-dependency, newline-delimited stdio JSON-RPC 2.0 server that hand-implements only the methods the tools need (`initialize`, `ping`, `tools/list`, `tools/call`, plus notification suppression and -32601/-32602 error responses), dispatch the three frozen tools to `@lore/core`'s store (`searchAdrs`, `readAdr`, `writeAdr` via `createStore`), resolve the root from `LORE_ROOT` ?? `process.cwd()`, and write logs to stderr only. `record_decision` routes a new ADR to `wiki/` when `config.autonomy === 'auto'` and `confidence >= config.confidenceThreshold`, otherwise to `drafts/`, and reports the written id/path. Ship a README documenting the run command, the Cline registration JSON (`mcpServers.lore` with `env.LORE_ROOT` and `autoApprove: ['search_lore','get_adr']` for both `~/.cline/mcp.json` and the VS Code panel), a `cline config mcp --json` verification step, and a manual smoke test that pipes real `initialize` / `tools/list` / `tools/call` requests through the server. The approach was verified with a real JSON-RPC handshake (per the commit message).

## Alternatives considered

- Depend on the official `@modelcontextprotocol/sdk` (the SPEC's first-listed option, gated on `npm install` working) — not chosen; the hand-rolled loop needs no install, keeps the package dependency-free, and the protocol surface Lore actually needs is small.
- Adopting the SDK's heavier feature surface (resources, prompts, sampling, transport variants) — implied by the SDK path and declined in favor of a minimal four-method loop (code comment and SPEC both state 'the protocol surface we need is small').
- Putting the tool handlers in a separate `src/tools.ts` module and an automated `test/mcp.test.ts` spawn-the-server suite (as the SPEC's deliverables list suggested) — not adopted in this commit, which implements the tools inline in `index.ts` and verifies via the README's manual JSON-RPC smoke test and the commit's handshake run.
- Resolving the repo root only from `process.cwd()` — rejected in favor of `LORE_ROOT` first (with cwd fallback), because the server is spawned by the MCP client from an arbitrary working directory.
- Logging to stdout — rejected in favor of stderr only, to keep stdout a clean JSON-RPC channel on a stdio transport.
- Writing every recorded decision straight to `wiki/` — rejected in favor of the config-driven wiki/drafts split (auto + confidence threshold), matching Lore's low-confidence-goes-to-drafts autonomy decision.

## Consequences

The MCP package stays dependency-free, so it can be spawned anywhere `node`/`tsx` runs and registers cleanly with any MCP client, including the VS Code Cline extension that cannot load native plugins — making MCP the portable, host-independent query/read path while hooks remain the only capture path. Because only a minimal protocol subset is implemented, advanced MCP capabilities are absent and unknown methods return -32601; the transport is newline-delimited with malformed lines silently ignored, and notifications (methods prefixed `notifications/`) get no reply. Stdout must remain protocol-only forever, so any future diagnostics must go to stderr. Automated coverage is deferred: verification is a documented manual handshake rather than a committed test file, and the tool handlers live inline in `index.ts` rather than in the SPEC's `src/tools.ts`. `record_decision` inherits Lore's autonomy policy, so an agent's low-confidence or non-auto recording lands in `drafts/` rather than the accepted wiki.

<!-- SOURCES: git commit c9d67db3, packages/mcp/src/index.ts, packages/mcp/README.md, packages/mcp/SPEC.md, packages/core/src/store.ts, packages/core/src/index.ts, PLAN.md, .lore/wiki/ADR-0001-layer-lore-as-one-core-plus-thin-adapters-native-hooks-captu.md, c9d67db3 -->
