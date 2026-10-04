---
id: ADR-0004
title: Capture Cline's live reasoning stream with a fail-open, node:*-only AgentPlugin onEvent hook that appends JSONL, and make the store self-heal its dirs
status: accepted
date: 2026-10-04
confidence: 0.82
sources:
  - commit 06a29a7e
  - packages/plugin/src/index.ts
  - packages/core/src/store.ts
  - packages/core/test/store.test.ts
  - packages/plugin/SPEC.md
  - PLAN.md
  - packages/core/src/types.ts
  - 06a29a7e
tags:
  - capture
  - plugin
  - hooks
  - cline-sdk
  - onEvent
  - jsonl
  - fail-open
  - reasoning-stream
  - store
---

# ADR-0004: Capture Cline's live reasoning stream with a fail-open, node:*-only AgentPlugin onEvent hook that appends JSONL, and make the store self-heal its dirs

## Context

Lore's differentiator is preserving the in-flight agent reasoning stream, which MCP tools cannot observe because MCP tools fire only when the model chooses to call them (PLAN.md §6; ADR-0001). Lane 2 must turn the Cline SDK AgentRuntimeEvent stream into the frozen LoreEvent shape and persist it under .lore/raw/. Three constraints shaped the implementation: (1) the plugin is installed as a single file via `cline plugin install ./packages/plugin`, so its runtime imports must be limited to node:* to remain a valid plugin; (2) capture runs inline in the agent loop, so it must never break or slow that loop; and (3) capture must work before any explicit `lore init`, i.e. capture-first. The event vocabulary was verified against Cline CLI 3.0.68: assistant-reasoning-delta, assistant-text-delta, tool-started, tool-finished, run-finished, run-failed, with reasoning exposed via text/accumulatedText.

## Decision

Ship Path B, the installable plugin: packages/plugin/src/index.ts default-exports an AgentPlugin ({name:'lore', manifest:{capabilities:['hooks']}, hooks:{onEvent}}) whose onEvent normalizes each recognized Cline runtime event into a LoreEvent (reasoning, assistant_text, tool_call, tool_result, run_finished, agent_error) carrying a ts + source:'cline-session' + iteration envelope and payload.runtimeEvent, then appends one JSON object per line to .lore/raw/session.jsonl (root from LORE_ROOT or process.cwd()). Keep runtime imports to node:fs/node:path only and declare a local RuntimeEventLike interface instead of importing @cline/sdk, so the module stays a valid installable single-file plugin. Wrap capture in try/catch so it fails open, and truncate large tool results/output (2000/4000 chars) to bound log growth. In parallel, make the core store self-heal: writeConfig and writeState now call mkdirSync(.lore/meta, {recursive:true}) before writing, so writes succeed without init(), with a regression test covering writeState without init. Verified live: 847 events captured from a real Cline run.

## Alternatives considered

- Capture reasoning through MCP tools only — rejected: MCP tools fire only when the model chooses to call them, so the in-flight reasoning stream is invisible (consistent with prior ADR-0001).
- SDK wrapper path (SPEC Path A: runWithCapture via new Agent(...).subscribe) — the SPEC's stated first-to-build path, but the installable onEvent plugin was the mechanism implemented and verified live (847 events), leaving the wrapper as a fallback rather than the shipped capture path.
- Import @cline/sdk and/or @lore/core for real at runtime inside the plugin — rejected: runtime imports must stay node:* only so the file remains a valid single-file plugin (types only, via `import type`, are erased).
- Fail-fast capture (let hook errors propagate) — rejected: a capture failure must never break or slow the agent loop, so all capture is wrapped in try/catch that swallows errors.
- Require `lore init` before any store write (mkdir only inside init) — rejected by the capture-first constraint; replaced with recursive mkdir on each write so the store creates its own meta dir on demand.

## Consequences

The black box is open: Lore accumulates the agent's reasoning + tool trail as append-only JSONL in .lore/raw/session.jsonl for the compiler to consume, and the practice was proven by capturing 847 events from a real run. Only the six recognized runtime event types are persisted (unknown events are dropped) and large payloads are truncated, so uncommon events and full-length results can be lost. Because the plugin deliberately avoids runtime dependencies on @cline/sdk and @lore/core, any change to Cline's runtime event shapes must be absorbed by editing the local RuntimeEventLike mapping rather than by a shared type. Fail-open swallowing means capture failures are silent, so the live 847-event run is evidence of viability rather than a guarantee, and hooks remain the unique capture path. The store now tolerates capture-first workflows without init, locked in by a dedicated test.

<!-- SOURCES: commit 06a29a7e, packages/plugin/src/index.ts, packages/core/src/store.ts, packages/core/test/store.test.ts, packages/plugin/SPEC.md, PLAN.md, packages/core/src/types.ts, 06a29a7e -->
