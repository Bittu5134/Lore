---
id: ADR-0020
title: Write the lore bin launcher in native ESM with import.meta.url
status: accepted
date: 2026-10-04
confidence: 0.6
sources:
  - 484340d1
  - b6b20919
  - 7a7a39fb
tags:
  - cli
  - esm
  - launcher
  - packaging
---

# ADR-0020: Write the lore bin launcher in native ESM with import.meta.url

## Context

Commit 7a7a39fb migrated packages/cli/bin/lore from CommonJS (require, __filename, path.join) to ESM imports while preserving its behavior: preferring the repo-local tsx binary (works offline) with an npx --yes tsx fallback, and keeping the Windows .cmd shell-spawn path. The same commit promoted ADR-0018/ADR-0019 drafts into the wiki. The two SKILL.md changes in commits 484340d1 and b6b20919 are already recorded as ADR-0018 and ADR-0019.

## Decision

Implement the CLI bin launcher as native ESM: import from node: builtins and resolve the launcher directory with dirname(realpathSync(fileURLToPath(import.meta.url))) instead of the CJS __filename global, leaving the tsx resolution and spawnSync logic otherwise unchanged.

## Alternatives considered

- (no alternatives were recorded in the captured events)

## Consequences

The launcher aligns with the ESM CLI package and no longer relies on CJS-only globals; path resolution now requires an ESM-capable Node runtime, and __filename-derived paths are replaced by import.meta.url-based equivalents.

<!-- SOURCES: 484340d1, b6b20919, 7a7a39fb -->
