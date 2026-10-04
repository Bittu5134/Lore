---
id: ADR-0023
title: Delete test.txt with plain rm and keep the file out of git tracking
status: draft
date: 2026-10-04
confidence: 0.5
sources:
  - test.txt
  - .gitignore
  - .lore/config.json
  - ADR-0022
  - ADR-0017
tags:
---

# ADR-0023: Delete test.txt with plain rm and keep the file out of git tracking

## Context

A scratch file test.txt at the repo root of the Lore repository contained only the text "hello world" (11 bytes) and was never committed — it showed up only as untracked in `git status`. The user asked for it to be deleted and explicitly stated: "assume its a non trivial change for the sake of demonstration". Per ADR-0022 a user flag overrides the size heuristic, so the deletion is recorded here even though the diff is trivial; the flag overrides the heuristic only, not the honesty requirement, so the reasoning below is limited to what was actually considered in this session.

## Decision

Removed the file with a plain `rm -v test.txt` at /home/bittu/Developer/temp/Lore/test.txt, and left it absent rather than adding a .gitignore entry. `rm` was chosen over `git rm` because the file was never tracked by git, so `git rm` would have failed with "fatal: pathspec 'test.txt' did not match any files"; no gitignore rule was added because a one-off scratch deletion does not warrant a permanent ignore pattern for a path that no longer exists, and .gitignore in this repo already ignores machine-local state rather than arbitrary filenames.

## Alternatives considered

- `git rm test.txt` — rejected because the file was never committed (git status showed only `?? test.txt`), so there is no index entry to remove and the command would have errored with a pathspec mismatch.
- Adding `test.txt` to .gitignore to guard against the file reappearing — rejected because the file is gone; an ignore rule for a nonexistent path adds permanent repo noise for no benefit, and ADR-0017 treats .gitignore as reserved for machine-local Lore state paths.

## Consequences

(recorded by an agent via MCP; review and expand)
