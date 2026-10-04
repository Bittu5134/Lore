---
id: ADR-0014
title: Self-heal unknown sync cursor by falling back to full git log
status: accepted
date: 2026-10-04
confidence: 0.9
sources:
  - 04180741
tags:
  - sync
  - cursor
  - self-heal
  - git
  - error-handling
---

# ADR-0014: Self-heal unknown sync cursor by falling back to full git log

## Context

lore sync silently captured nothing on a fresh clone or after history rewrites: commitsSince() caught every git error and returned an empty list, so a cursor SHA the repo does not know (fresh clone, squashed or force-pushed history, cursor committed from another machine) made the invalid <sha>..HEAD range look like 'no new commits'.

## Decision

In packages/cli/src/commands/sync.ts, distinguish 'invalid cursor' from 'no new commits': when the <sha>..HEAD range fails, retry with the full git log so the cursor heals instead of capturing nothing. Add packages/cli/test/sync.test.ts covering both cursor paths and include it in the npm test script.

## Alternatives considered

- Catch every git error and return an empty list (previous behavior) — masked invalid cursors from fresh clones, rewritten history, or foreign-machine SHAs and made sync silently useless

## Consequences

Sync recovers automatically on fresh clones and after force-pushes/squashes; the cursor self-heals on first successful run; both cursor paths are covered by automated tests.

<!-- SOURCES: 04180741 -->
