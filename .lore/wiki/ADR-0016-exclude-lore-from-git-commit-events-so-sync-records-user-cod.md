---
id: ADR-0016
title: Exclude .lore/** from git-commit events so sync records user code only
status: accepted
date: 2026-10-04
confidence: 0.9
sources:
  - b823a9c0
tags:
  - sync
  - event-ingestion
  - git-pathspec
  - self-capture
---

# ADR-0016: Exclude .lore/** from git-commit events so sync records user code only

## Context

The sync command converts git commits into Lore events for ADR inference (commitToEvent in packages/cli/src/commands/sync.ts). Without filtering, Lore's own commits — cursor updates, raw evidence, and other .lore/ churn — would be ingested as if they were user decisions, polluting the wiki with self-referential noise. This complements ADR-0009 (self-capture guard on the live hook) and ADR-0015 (untracking local state) by applying the same protection on the historical-sync path.

## Decision

In commitToEvent, pass git pathspec exclude magic `:(exclude).lore/**` on both the `git show --name-only` (file list) and `git show --patch` (diff) invocations, so commit events describe only user code. The 8000-character diff truncation is preserved.

## Alternatives considered

- (no alternatives were recorded in the captured events)

## Consequences

Commit-derived events no longer include Lore's internal churn, so ADR inference and the compiled wiki describe the user's project rather than Lore's own bookkeeping. Protection holds even if .lore files are accidentally tracked, and the pathspec approach keeps filtering inside git rather than in TypeScript post-processing.

<!-- SOURCES: b823a9c0 -->
