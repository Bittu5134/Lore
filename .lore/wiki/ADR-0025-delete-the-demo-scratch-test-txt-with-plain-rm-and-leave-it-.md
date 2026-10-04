---
id: ADR-0025
title: Delete the demo scratch test.txt with plain rm and leave it untracked
status: accepted
date: 2026-10-04
confidence: 0.75
sources:
  - test.txt
  - ADR-0024
  - ADR-0022
  - ADR-0023
  - ADR-0017
  - .lore/drafts/ADR-0023-delete-test-txt-with-plain-rm-and-keep-the-file-out-of-git-t.md
tags:
---

# ADR-0025: Delete the demo scratch test.txt with plain rm and leave it untracked

## Context

ADR-0024 created /home/bittu/Developer/temp/Lore/test.txt as a demonstration scratch file (12 bytes, "Hello world", untracked, not matched by .gitignore). In this session the user said: "delete test.txt as a non trivial chnage for demonstrtion" — explicitly flagging the change as non-trivial to exercise Lore's capture path. Verified before acting: `git ls-files --error-unmatch test.txt` returned "error: pathspec 'test.txt' did not match any file(s) known to git" and `git check-ignore -v test.txt` produced no match, so the file was untracked and not ignored. The repo already carried an equivalent unaccepted draft from an earlier identical demo (ADR-0023, .lore/drafts/ADR-0023-delete-test-txt-with-plain-rm-and-keep-the-file-out-of-git-t.md), which showed the size heuristic alone would not have produced this record; the explicit user flag is what made it capture-worthy per ADR-0022.

## Decision

Deleted the file with a single `rm test.txt` at /home/bittu/Developer/temp/Lore/test.txt (verified gone via `ls`), and deliberately did not commit the deletion, add a .gitignore entry, or write any ADR by hand. `rm` rather than `git rm` because the path had no index entry; no gitignore rule because the file is gone and ADR-0017 reserves .gitignore for machine-local Lore state paths; no hand-written ADR because the capture path is meant to produce this record itself.

## Alternatives considered

- `git rm test.txt` — rejected: no index entry exists for an untracked path, so it would have failed with the pathspec mismatch observed in this session.
- Adding `test.txt` to .gitignore to stop it reappearing — rejected: the file no longer exists, and ADR-0017 treats .gitignore as reserved for machine-local Lore state, so an ignore rule for a scratch path is permanent repo noise for no benefit.
- Hand-writing the ADR file into .lore/wiki/ instead of letting Lore capture it — rejected: the point of the demonstration was the capture path; a hand-written file would bypass the evidence attribution and the draft/accept gate that the run is meant to exercise.

## Consequences

(recorded by an agent via MCP; review and expand)
