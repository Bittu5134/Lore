---
name: lore
description: Use the repository's Lore wiki before changing code, and record new architectural decisions after.
---

# Lore — architectural memory

This repository keeps architectural decision records (ADRs) in `.lore/wiki/`.

## Before you edit code

1. Read `.lore/wiki/index.md`.
2. Search for the files and concepts you are about to touch:
   - with the Lore MCP server connected, call `search_lore`;
   - otherwise read the 2-3 ADRs whose titles or tags match your task.
   Read at most 3 — respect the context budget.
3. If an ADR covers your area, follow it. To contradict it, say explicitly in your final answer which
   ADR you are superseding and why.

## While you work

When you make a non-obvious choice — a library, a pattern, a data structure, a trade-off — record it:
call `record_decision` if the MCP server is available, otherwise write an ADR into `.lore/drafts/`
using `.lore/wiki/ADR-0000-template.md`. Always include the alternatives you rejected and the reason
each was rejected.

Never edit `.lore/raw/` (immutable evidence) or `.lore/meta/` (bookkeeping).

## At the end

State which ADRs you consulted and what you recorded.
