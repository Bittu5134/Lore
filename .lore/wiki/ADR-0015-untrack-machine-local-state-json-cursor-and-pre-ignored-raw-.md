---
id: ADR-0015
title: Untrack machine-local state.json cursor and pre-ignored raw evidence from git
status: accepted
date: 2026-10-04
confidence: 0.85
sources:
  - 04180741
tags:
  - git-hygiene
  - local-state
  - raw-evidence
  - gitignore
---

# ADR-0015: Untrack machine-local state.json cursor and pre-ignored raw evidence from git

## Context

.lore/meta/state.json was git-tracked even though it is documented as machine-local bookkeeping; the post-commit hook rewrites lastCommit on every commit, so the tree was never clean and committing the fix retriggered the hook — an unbreakable one-commit lag. Separately, .lore/raw/*.jsonl predated the .gitignore rule for .lore/raw/, so 2.5 MB of LOCAL-by-design evidence (session.jsonl, commits.jsonl, cli-hooks.jsonl) kept being committed.

## Decision

gitignore .lore/meta/state.json alongside the other machine-local meta files, and git rm --cached the tracked raw JSONL files (they stay on disk), so raw evidence and the per-machine SHA cursor are never tracked.

## Alternatives considered

- Keep state.json tracked — rejected: the post-commit hook rewrites it every commit, leaving the tree permanently dirty and retriggering the hook on the fix commit
- Rely on .gitignore alone for raw files — rejected: ignore rules do not untrack already-tracked files, so the pre-existing evidence kept being committed

## Consequences

Working tree stays clean across commits; fresh clones start with a local-only cursor; 2.5 MB of raw evidence remains on disk but out of the repository, consistent with ADR-0010's local-evidence principle.

<!-- SOURCES: 04180741 -->
