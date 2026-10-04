---
id: ADR-0017
title: Append Lore local-state paths to user .gitignore idempotently at init
status: accepted
date: 2026-10-04
confidence: 0.85
sources:
  - b823a9c0
tags:
  - init
  - gitignore
  - local-state
  - onboarding
---

# ADR-0017: Append Lore local-state paths to user .gitignore idempotently at init

## Context

ADR-0015 untracked machine-local state in Lore's own repository, but user repos where Lore is installed need the same protection when `lore init` runs. The init command (packages/cli/src/commands/init.ts) previously created .lore/ structure, rules, and hooks but left it to the user to keep raw evidence and cursors out of git.

## Decision

`lore init` now appends a commented block to the repo's existing .gitignore listing `.lore/raw/`, `.lore/meta/state.json`, `.lore/meta/inference.lock`, `.lore/meta/previous-hooks-path.txt`, `.lore/meta/search.db`, `.lore/meta/links.json`, and `.lore/wiki/graph.html`. Lines already present are skipped (existence and substring check), and a trailing newline is normalized, making the operation idempotent. Wiki ADRs remain committed; only local bookkeeping and raw evidence are excluded.

## Alternatives considered

- (no alternatives were recorded in the captured events)

## Consequences

Machine-local bookkeeping and raw evidence stay out of git in every user repo where Lore is initialized, while the shared wiki stays version-controlled. Re-running init is safe because existing entries are detected and skipped, and no separate ignore template file or manual user step is required.

<!-- SOURCES: b823a9c0 -->
