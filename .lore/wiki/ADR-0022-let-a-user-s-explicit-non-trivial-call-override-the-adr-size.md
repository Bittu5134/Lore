---
id: ADR-0022
title: Let a user's explicit "non-trivial" call override the ADR size heuristic
status: accepted
date: 2026-10-04
confidence: 0.72
sources:
  - .clinerules/lore.md
  - packages/mcp/src/index.ts
  - packages/plugin/src/rules.ts
tags:
---

# ADR-0022: Let a user's explicit "non-trivial" call override the ADR size heuristic

## Context

record_decision's description told agents to skip trivial changes (formatting, typos, dependency bumps). During a demo the user explicitly stated a change was non-trivial even though it looked small, and the agent still declined to record it — the size heuristic was silently overriding a direct instruction from the person who owns the repository.

The wiki already trusts explicit human authority in the same spirit: .clinerules/lore.md already tells agents to state in their final answer which ADR they are superseding, and ADR-0006 already makes the human the final authority on merge conflicts. The size heuristic was the one place where the tool second-guessed the human instead of the model's own judgment.

## Decision

Invert the default only for an explicit user flag. record_decision's tool description, the plugin continuity rule (continuityRule in packages/plugin/src/rules.ts) and .clinerules/lore.md all now say: record the change even if it looks small when the user explicitly calls it non-trivial or significant, and note in Consequences that the user flagged it.

Chosen as prompt text only, with no schema change, so CONTRACTS_VERSION stays 2 and lanes in packages/core/src/types.ts keep integrating against unchanged definitions. The routing gate is untouched: a user-flagged change still has to clear config.confidenceThreshold to reach wiki/, so user authority overrides the size heuristic without overriding the compiler's own confidence estimate.

The flag is explicitly scoped as an override of the size heuristic only, never of the honesty requirements — the instruction says not to invent alternatives that were not actually considered, so a flag cannot be used to manufacture a well-formed-looking ADR.

## Alternatives considered

- Add a boolean userFlaggedNonTrivial param to RecordDecisionInput in packages/core/src/types.ts — rejected because it forces CONTRACTS_VERSION 2 -> 3, and the file states lanes run in parallel against exactly those definitions; a prompt-only instruction covers the whole failure mode at zero migration cost.
- Let the flag also bypass config.confidenceThreshold so user-flagged ADRs land directly in wiki/ — rejected because it would give user authority over the compiler's own confidence estimate, collapsing the autonomy gate that ADR-0008 depends on; the two authorities stay independent.
- Remove the trivial-change guidance from record_decision entirely — rejected because the heuristic is load-bearing: without it, routine commits would flood the wiki with empty-context ADRs, which is the failure ADR-0008's empty-array contract was written to prevent.

## Consequences

(recorded by an agent via MCP; review and expand)
