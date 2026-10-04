---
id: ADR-0026
title: Document frozen core contracts in-source and gate edits on CONTRACTS_VERSION
status: accepted
date: 2026-10-04
confidence: 0.6
sources:
  - 247533b7
tags:
  - contracts
  - documentation
  - types
  - versioning
  - cross-package
---

# ADR-0026: Document frozen core contracts in-source and gate edits on CONTRACTS_VERSION

## Context

packages/core/src/types.ts is the interface every lane codes against, but its documentation was terse. The module header already declared the types frozen and required bumping CONTRACTS_VERSION, yet that rule and the shapes it covers (on-disk .lore layout, config schema, telemetry events, ADR shapes, compiler signatures, MCP tool signatures, git hook contracts) were not spelled out in-source, leaving cross-package coordination to tribal knowledge.

## Decision

Codify types.ts as the single frozen contract of record: expand it with @fileoverview/@description blocks enumerating the contract surface and add per-field JSDoc to every exported type (and per-function JSDoc to the CLI command modules). State the invariant explicitly: field names/types must not change without incrementing CONTRACTS_VERSION and coordinating across the core, cli, plugin, and mcp packages. Keep the change documentation-only (comments, JSDoc, and field reordering; no runtime behaviour change).

## Alternatives considered

- (no alternatives were recorded in the captured events)

## Consequences

The in-source contract docs become the canonical, co-located reference, reducing drift between the parallel packages; the CONTRACTS_VERSION bump rule is now a written obligation rather than implicit. Cost: the JSDoc must be kept in sync with shapes as they evolve, and the bump/coordination discipline relies on contributors honoring the documented invariant. No runtime behaviour changed, so any divergence surfaces only when a contract edit is made without a version bump.

<!-- SOURCES: 247533b7 -->
