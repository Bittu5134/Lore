---
id: ADR-0006
title: Preserve both sides of divergent wiki edits on merge and exchange decisions as portable JSON bundles (share/pull) instead of letting git merge the wiki
status: accepted
date: 2026-10-04
confidence: 0.78
sources:
  - commit a6114869
  - packages/cli/src/commands/share.ts
  - packages/cli/src/commands/pull.ts
  - packages/cli/src/commands/reconcile.ts
  - .lore/hooks/post-merge
  - .lore/config.json
  - PLAN.md
  - .lore/wiki/ADR-0003-resolve-adr-id-collisions-at-write-time-from-existing-adr-fi.md
  - a6114869
tags:
  - merge
  - reconcile
  - share
  - pull
  - bundle
  - portability
  - adr-id
  - git-hooks
  - knowledge-preservation
  - lane-5
---

# ADR-0006: Preserve both sides of divergent wiki edits on merge and exchange decisions as portable JSON bundles (share/pull) instead of letting git merge the wiki

## Context

Lore commits its .lore/ wiki (ADR pages under wiki/ and drafts/) as a shared knowledge base, so multiple contributors and branches extend the same ADR set. PLAN.md defines Lane 5 as 'Merge + Mechanism: post-merge reconciler, lore share/pull', and a post-merge hook plus config key autoMergeReconcile already existed waiting for the command. Two failure modes appear after merging divergent branches: (a) the same page carries raw git conflict markers, and (b) both branches authored a page claiming the same ADR id (the id-collision hazard already recorded in ADR-0003). Separately, there was no way to hand decisions to another contributor - or another agent session - without sharing the whole repository history. The commit message records the lane was verified end to end: '2 ADRs shared/imported, duplicate ids renumbered'.

## Decision

Ship three CLI commands in packages/cli/src/commands. `lore share [--out <file>]` serializes the wiki into one portable JSON bundle (LoreBundle v1: version, exportedAt, repo, adrs[], rawEventCount), defaulting to .lore/lore-bundle.json, so decisions travel without the repository history. `lore pull <file>` imports a bundle, skipping ids already present and routing draft-status ADRs to drafts/ and accepted ones to wiki/, then regenerating the index. `lore reconcile` (run from the git post-merge hook) repairs the wiki mechanically: conflict markers are resolved by retaining BOTH variants, joined by a '<!-- lore: merged an incoming variant of this decision -->' comment, and duplicate ADR ids are renumbered to the next free padded id (rewriting frontmatter id and the matching '# <id>:' H1, content preserved). If anything changed it regenerates the index and commits as 'lore: reconcile wiki' with --no-verify, and git failure degrades to a message rather than an error.

## Alternatives considered

- Let git merge the wiki and commit raw conflict markers in ADR pages - rejected: markers make pages and the index unreadable; reconcile resolves them instead.
- Resolve a conflicted page by picking one side (ours or theirs) - rejected: it discards one contributor's decision; the resolver keeps both variants, consistent with Lore's premise of preserving rationale and rejected alternatives.
- Let duplicate ADR ids stand, or drop the later page - rejected: it either breaks id uniqueness or loses knowledge; the later page is renumbered so both survive, mirroring ADR-0003's on-disk-id-as-source-of-truth rule.
- Share the whole repository history (or the raw event logs) to convey decisions - rejected: share/pull hands over a single JSON file so a contributor or agent session gets the decisions without the repo history.
- On pull, overwrite or fail on ids already present - rejected: existing ids are skipped so an import is non-destructive.
- Run reconcile via an ordinary commit that triggers hooks - rejected: it commits with --no-verify to avoid re-triggering the installed post-commit/post-merge sync and reconcile hooks.

## Consequences

Divergent branches merge without losing either side's ADRs and the wiki stays navigable; duplicate pages are renumbered so ids stay unique. The bundle becomes an interchange interface: LoreBundle is declared in share.ts and imported by pull.ts, so its shape is now a coupling point. But the bundle carries only compiled ADRs plus a rawEventCount - the underlying raw events/evidence are not shipped, so imported decisions arrive without their source trail. Renumbering rewrites the id, the filename and the H1, so any external reference to the old id breaks. Reconcile auto-commits and hides failures (git errors degrade to a message), and because it runs from post-merge with --no-verify it assumes git is available in the working directory.

<!-- SOURCES: commit a6114869, packages/cli/src/commands/share.ts, packages/cli/src/commands/pull.ts, packages/cli/src/commands/reconcile.ts, .lore/hooks/post-merge, .lore/config.json, PLAN.md, .lore/wiki/ADR-0003-resolve-adr-id-collisions-at-write-time-from-existing-adr-fi.md, a6114869 -->
