---
id: ADR-0021
title: Auto-approve the record_decision MCP tool in Cline registration
status: accepted
date: 2026-10-04
confidence: 0.6
sources:
  - 3f0e7c9b
tags:
  - mcp
  - permissions
  - autonomy
  - cline
---

# ADR-0021: Auto-approve the record_decision MCP tool in Cline registration

## Context

`lore mcp --install` writes the `lore` server entry into Cline's `~/.cline/mcp.json`. Its `autoApprove` list previously contained only the two read-only tools (`search_lore`, `get_adr`), so every call to the mutating `record_decision` tool surfaced an approval prompt. The Lore continuity rule instructs agents to call `record_decision` while they work, so requiring per-call approval broke the intended "decisions write themselves" flow.

## Decision

Add `record_decision` to the `autoApprove` array in the Cline MCP registration config emitted by `packages/cli/src/commands/mcp.ts`, so agents can persist ADRs without a human approval prompt on each write.

## Alternatives considered

- (no alternatives were recorded in the captured events)

## Consequences

The agent's decision-recording path becomes frictionless, matching the auto-capture promise. The write tool now runs unattended; blast radius stays bounded because `record_decision` still routes to `.lore/drafts/` unless `config.autonomy === "auto"` and confidence meets the threshold. The README/SPEC examples still list `autoApprove: ["search_lore", "get_adr"]`, so those docs now drift from the emitted config.

<!-- SOURCES: 3f0e7c9b -->
