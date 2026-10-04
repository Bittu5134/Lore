# Lore — Architectural Memory

`.lore/` holds the WHY behind this repository's code: architectural decision
records (ADRs) in `.lore/wiki/ADR-*.md`.

## Before you edit code

1. Read `.lore/wiki/index.md`.
2. If a `search_lore` tool is available, search for the files and concepts you are
   about to touch. Otherwise read the 2-3 ADRs whose titles or tags match your
   task. Read at most 3 - respect the context budget.
3. If an ADR covers your area, follow it. To contradict it, say explicitly in
   your final answer which ADR you are superseding and why.

## While you work

4. When you make a non-obvious choice (a library, a pattern, a data structure, a
   trade-off), record it: call the `record_decision` tool if available, or write
   an ADR to `.lore/drafts/` using `.lore/wiki/ADR-0000-template.md`. Always
   include the alternatives you rejected and the reason - that is the most
   valuable part.
5. Never edit `.lore/raw/` (immutable evidence) or `.lore/meta/` (bookkeeping).

## At the end

6. State which ADRs you consulted and what you recorded.
