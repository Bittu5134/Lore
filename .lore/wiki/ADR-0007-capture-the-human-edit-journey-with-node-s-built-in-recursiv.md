---
id: ADR-0007
title: Capture the human edit journey with Node's built-in recursive fs.watch — debounced and batched into a single fs_batch event — instead of a third-party watcher or per-file events
status: accepted
date: 2026-10-04
confidence: 0.7
sources:
  - commit 429a2352
  - packages/cli/src/commands/watch.ts
  - DEMO.md
  - packages/cli/SPEC.md
  - PLAN.md
  - .lore/wiki/ADR-0001-layer-lore-as-one-core-plus-thin-adapters-native-hooks-captu.md
  - .lore/wiki/ADR-0005-hand-roll-a-zero-dependency-stdio-json-rpc-mcp-server-for-lo.md
  - 429a2352
tags:
  - capture
  - fs-watcher
  - human-capture
  - cli
  - debounce
  - batching
  - zero-dependency
  - node-fs
  - lane-4
  - demo
  - verification
---

# ADR-0007: Capture the human edit journey with Node's built-in recursive fs.watch — debounced and batched into a single fs_batch event — instead of a third-party watcher or per-file events

## Context

Lore must capture rationale from humans, not just AI agents (PLAN.md), and prior ADR-0001 committed to 'git hooks + fs watcher' as the fully host-independent human-capture layer because git diffs and commit messages ('Fixed the search algorithm') hide the why. packages/cli/SPEC.md (Lane 4) specifies `lore watch` on Node 22's recursive `fs.watch(root,{recursive:true})`, debounce ~2s, filter via config.ignore, accumulate touched paths in memory and flush ONE `fs_batch` event, printing a live line per flush. The implementation's own header states the forcing insight: 'Diffs show the destination; a watcher shows the road: files touched, tried, and reverted.' Two project-wide constraints shaped the choice: the repo is deliberately dependency-light / node:*-only (the capture plugin is restricted to node:* per ADR-0004, and the MCP server was hand-rolled with zero dependencies per ADR-0005), so pulling in a watcher library would be out of character; and the append-only .lore/raw log must not be flooded with noise. The commit is labelled 'verified: captures edit batches' and pairs the watcher with DEMO.md, a verified 4-6 min judge script in which the watcher appears as an 'optional extra' alongside backfill and MCP.

## Decision

Ship `lore watch` in packages/cli/src/commands/watch.ts using Node's built-in `watch(root,{recursive:true})` from node:fs. Ignore `.git/`, `.lore/`, and each config.ignore glob (with `/**` and trailing `/` stripped); accumulate touched relative paths in an in-memory Set; debounce flushes with a 2500ms timer; on flush sort and clear the set and append exactly one LoreEvent `{source:'fs-session', kind:'fs_batch', payload:{files, note:'editing session'}}` through the @lore/core store, printing a live 'captured N edit(s)' line; on SIGINT clear the timer, flush, close the watcher, and tell the user to run `lore compile` (the watcher itself does not invoke inference). DEMO.md records the full verified pipeline and advertises the watcher as an optional live-edit-journey extra.

## Alternatives considered

- Adopt a third-party cross-platform file watcher (e.g. chokidar) — implied and not taken: the codebase is deliberately dependency-light (node:*-only plugin per ADR-0004, zero-dependency hand-rolled MCP server per ADR-0005), and Node's built-in recursive watcher suffices on the verified runtime.
- Emit one durable event per individual file change — rejected: it would flood the append-only raw log with noise, so touched paths are accumulated and flushed as a single batched fs_batch event representing one session step.
- Auto-compile the wiki inside the watcher when idle >30s or on Ctrl-C (SPEC.md wording) — the shipped command does not run inference itself; it flushes events and directs the user to run `lore compile`, keeping the slow `cline -p` call out of the watch loop.
- Rely solely on git post-commit hooks for human capture — insufficient: hooks see only committed destinations, whereas the watcher records the intermediate road (files touched, tried and reverted) that a diff cannot show.
- Watch the whole tree including .lore/ and .git/ — rejected to avoid feedback loops and noise, since Lore continuously writes its own store.

## Consequences

Adds human-edit capture with zero new dependencies, consistent with the node:*-only / zero-dep posture. Correctness depends on the runtime supporting recursive fs.watch (true on the verified Node v26.10.0); on runtimes lacking it the watcher would miss nested files. Debouncing collapses rapid bursts into one event and files are stored as a sorted set, so per-file timing and edit order are lost — the event captures which files belonged to a session, not a chronological timeline. Filtering .lore/ and .git/ prevents Lore's own writes from retriggering itself. The watcher is opt-in and manual (started in a terminal), and DEMO.md presents it as an 'optional extra' rather than the demo spine, leaving the post-commit hook as the primary no-AI capture path. Committing DEMO.md makes the verified judge script part of the repo but couples it to machine-specific absolute paths (/home/bittu/...).

<!-- SOURCES: commit 429a2352, packages/cli/src/commands/watch.ts, DEMO.md, packages/cli/SPEC.md, PLAN.md, .lore/wiki/ADR-0001-layer-lore-as-one-core-plus-thin-adapters-native-hooks-captu.md, .lore/wiki/ADR-0005-hand-roll-a-zero-dependency-stdio-json-rpc-mcp-server-for-lo.md, 429a2352 -->
