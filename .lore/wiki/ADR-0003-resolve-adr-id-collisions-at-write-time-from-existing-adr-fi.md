---
id: ADR-0003
title: Resolve ADR id collisions at write time from existing ADR files, not from the counter
status: accepted
date: 2026-10-04
confidence: 0.84
sources:
  - 079cf3df
  - packages/core/src/store.ts
  - packages/core/src/compiler.ts
  - packages/core/test/store.test.ts
  - packages/core/test/compiler.test.ts
  - .lore/meta/state.json
tags:
  - adr-id
  - concurrency
  - store
  - compiler
  - dogfooding
  - json-parsing
  - atomicity
---

# ADR-0003: Resolve ADR id collisions at write time from existing ADR files, not from the counter

## Context

Lore assigns each ADR a sequential id from a monotonic counter: `.lore/meta/state.json` holds `nextAdrId`, and the compiler also derives an id as `max(existing ids) + 1` from a snapshot of already-written ADRs (`packages/core/src/compiler.ts`). Capture lanes, however, run concurrently — a git post-commit hook can overlap a manual `lore sync` — so two writers can read the same stale counter/snapshot and both emit the same next id. Dogfooding Lore on its own repository (the commit message: 'fix ADR id collisions on concurrent writes (found via dogfooding)') surfaced exactly this collision. The same commit also hardened the inference parse path, because `cline -p` prints its `[thinking]` stream to stdout and the thinking often quotes the requested JSON schema, so the first valid-looking `{...}` object is not the final answer.

## Decision

Make the on-disk ADR set the source of truth for id uniqueness. In `store.writeAdr`, before writing, collect `allAdrFrontmatter()` into a set of taken ids; if the incoming ADR's id is already taken, increment to the next free id via `padId`, rewriting BOTH the frontmatter `id` and the matching `# <id>:` H1 in the body, then write and advance `nextAdrId` to `max(state.nextAdrId, numericId(newId)+1)`. Collisions are resolved defensively at the write boundary rather than trusting the counter or the compiler-provided id. In the same change, `parseDecisionJson` was made to evaluate JSON candidates from the END (the final answer comes last) instead of the first candidate, with a cheap prefilter keeping only objects that contain `"title"` or `"decision"` and the 64-candidate cap removed.

## Alternatives considered

- Rely on `state.nextAdrId` alone to guarantee unique ids — rejected: concurrent writers read the same stale counter and produce duplicate ids (the observed dogfooding bug).
- Trust the compiler-provided id (`max existing + 1`) — rejected: it is computed from a snapshot of `existing` at compile time and can be stale by the time `writeAdr` runs.
- File locking / mutex around writes — implied but not chosen; the fix instead performs cheap post-hoc collision resolution against the current ADR files (lower complexity, tolerates overlap rather than preventing it).
- Keep returning the first valid-looking JSON object from `cline -p` output — rejected: the `[thinking]` stream quotes the requested schema, so the first match is often scratch thinking, not the answer; the final answer must be preferred.

## Consequences

ADR ids can no longer collide even when capture lanes overlap; the ADR files (not the counter) become the authoritative source for id uniqueness. The cost is an extra read of all ADR frontmatter on every `writeAdr`, and body text must be rewritten when an id is remapped (the H1 replacement assumes the `# <id>:` prefix format). Dogfooding Lore on its own repo was validated as a real bug-discovery mechanism, and the tests were updated to lock in both behaviors (a store test asserting ADR-0002 is allocated on a second identical write, and a compiler test asserting the final JSON candidate wins). The parser remains tolerant of Cline output-format quirks (balanced-brace candidate scanning plus control-character repair).

<!-- SOURCES: 079cf3df, packages/core/src/store.ts, packages/core/src/compiler.ts, packages/core/test/store.test.ts, packages/core/test/compiler.test.ts, .lore/meta/state.json -->
