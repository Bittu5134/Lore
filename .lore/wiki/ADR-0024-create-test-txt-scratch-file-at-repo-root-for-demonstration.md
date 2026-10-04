---
id: ADR-0024
title: Create test.txt scratch file at repo root for demonstration
status: accepted
date: 2026-10-04
confidence: 1
sources:
  - user prompt
tags:
---

# ADR-0024: Create test.txt scratch file at repo root for demonstration

## Context

The user requested creating a test.txt file at the repository root and explicitly stated: 'asume its a non trvial change for demonstration'. Per Lore guidance (and ADR-0022), when the user explicitly flags a change as non-trivial or significant, an ADR is recorded regardless of the small diff size. This flag overrides the size heuristic, while preserving honesty regarding actual options evaluated.

## Decision

Created a plain scratch file `test.txt` at the repository root containing placeholder text ('Hello world\n'). Left it uncommitted as an untracked scratch artifact.

## Alternatives considered

- Placing the test file under a test/ or fixtures/ directory — rejected because the user specifically requested `test.txt` at the root for a scratch demonstration.
- Committing `test.txt` to git immediately — rejected because scratch demonstration files should remain untracked unless explicitly requested to be part of version control.

## Consequences

(recorded by an agent via MCP; review and expand)
