---
id: ADR-0010
title: Keep raw evidence local and month-partitioned; index wiki with SQLite FTS5
status: accepted
date: 2026-10-04
confidence: 0.88
sources:
  - d760b86d
  - 94d9b3dd
  - 86786cf0
  - bb3b9bef
  - 697fa9ed
  - 14c2b9ae
  - 62dd7adf
  - aced580b
  - d1ace4cc
tags:
  - storage
  - scaling
  - sqlite
  - fts5
  - indexing
---

# ADR-0010: Keep raw evidence local and month-partitioned; index wiki with SQLite FTS5

## Context

Asked whether Lore works for hundreds of contributors across years, the storage layer did not: raw logs were committed to git, `readEvents` parsed the entire history, `writeAdr` regenerated `wiki/index.md` per write (O(n^2) across a backfill), and search was a linear scan.

## Decision

`.lore/raw/` is now git-ignored — only curated `wiki/`, `drafts/`, `config.json` and `hooks/` are committed; raw events are partitioned into `raw/YYYY-MM-<source>.jsonl` so a cursor lets `readEvents({since})` skip whole months; `writeAdr()` no longer regenerates the index (rebuilt once per run or on demand via `lore index`); `lore index` builds a SQLite FTS5 table (`.lore/meta/search.db`) using Node's built-in `node:sqlite`, and `searchAdrsAsync()` uses it, falling back to the linear scan when FTS5 is unavailable.

## Alternatives considered

- Commit raw logs to git — rejected: high-churn append-only logs would bloat history by hundreds of MB over a project's life
- Regenerate index.md on every write — rejected: O(n) per ADR means O(n^2) per backfill
- Third-party search library — rejected: zero-dependency ethos; node:sqlite ships with Node 22+
- Linear scan only — rejected: correct but too slow at scale

## Consequences

Multi-GB evidence stays local; the wiki carries the shareable knowledge and share/pull bundles (ADR-0006) remain the exchange mechanism. Roadmap recorded in docs/scaling.md: retention/pruning of old partitions, scheduled rollups, incremental FTS inserts, and a real append service (SQLite WAL or queue) for distributed sessions.

<!-- SOURCES: d760b86d, 94d9b3dd, 86786cf0, bb3b9bef, 697fa9ed, 14c2b9ae, 62dd7adf, aced580b, d1ace4cc -->
