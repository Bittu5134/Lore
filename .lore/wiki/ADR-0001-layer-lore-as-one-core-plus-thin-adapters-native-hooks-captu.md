---
id: ADR-0001
title: Layer Lore as one core plus thin adapters: native hooks capture reasoning, MCP serves queries
status: accepted
date: 2026-10-04
confidence: 0.8
sources:
  - 15e554be
  - beb35be8
  - afd248b3
  - 261b5cdc
  - dbf61729
  - 2b00b9af
  - PLAN.md
  - packages/core/src/types.ts
  - packages/core/src/compiler.ts
tags:
  - architecture
  - integration
  - capture
  - mcp
  - hooks
  - contracts
  - monorepo
  - inference
---

# ADR-0001: Layer Lore as one core plus thin adapters: native hooks capture reasoning, MCP serves queries

## Context

AI coding agents generate code fast, but their intermediate reasoning and rejected alternatives vanish when a task ends, and human commits are too generic to preserve the why. Lore must capture architectural rationale from both AI agents and humans and keep it inside the repository. Research against the installed Cline CLI surfaced two forcing constraints: (1) MCP tools fire only when the model chooses to call them, so the in-flight reasoning stream is invisible to MCP; and (2) SDK plugins/hooks work only in SDK/CLI/Kanban, not VS Code/JetBrains, while MCP and rules work everywhere.

## Decision

Build a single @lore/core engine and keep every other surface a thin adapter coded against frozen contracts in packages/core/src/types.ts. Capture reasoning natively via the SDK plugin onEvent stream plus CLI hooks.json; expose a portable query/API surface via a stdio MCP server (search_lore, get_adr, record_decision); cover host-independent human capture with git post-commit/post-merge hooks and an fs watcher; provide continuity with a committed .clinerules/lore.md rule. Compile inference shells out to `cline -p` to reuse existing Cline auth. The .lore/ store is committed on purpose as the shared knowledge base, with raw/ append-only and wiki/ as compiled output.

## Alternatives considered

- Capture reasoning through MCP tools only — rejected because MCP tools run only when the model chooses to call them, so the reasoning stream cannot be observed
- Capture via VS Code / JetBrains plugins — rejected by platform constraint: plugins/hooks are limited to SDK/CLI/Kanban and would not work portably
- A single monolithic, Cline-locked tool — implied and rejected in favor of a layered core so the query surface stays portable across hosts
- Integrate an LLM API directly with the project's own keys — rejected in favor of shelling out to `cline -p`, which reuses existing Cline auth and needs zero API-key setup

## Consequences

The reasoning stream is only capturable where native hooks exist, so hooks remain the unique capture path while MCP and rules supply portability across editors. Frozen contracts (CONTRACTS_VERSION) let parallel lanes build adapters independently against exactly these shapes. Coupling inference to the `cline -p` CLI means its stdout — which includes the [thinking] stream — must be parsed robustly (balanced-JSON candidate extraction plus control-character repair) instead of trusting the first JSON fragment.

<!-- SOURCES: 15e554be, beb35be8, afd248b3, 261b5cdc, dbf61729, 2b00b9af, PLAN.md, packages/core/src/types.ts, packages/core/src/compiler.ts -->
