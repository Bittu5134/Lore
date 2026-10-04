---
id: ADR-0011
title: Trigger auto-compile on every session end, including run-failed
status: accepted
date: 2026-10-04
confidence: 0.8
sources:
  - 40aa5ad3
tags:
  - autonomy
  - plugin
  - compile
  - capture
  - session-end
---

# ADR-0011: Trigger auto-compile on every session end, including run-failed

## Context

ADR-0008 gated auto-compile on the run-finished event only, so sessions that ended via run-failed (errors, aborts) never distilled their reasoning into ADRs; the capture plugin already observes session-end signals and the inference lock prevents recursion.

## Decision

The plugin now fires the detached `lore compile` on ANY session-end signal — run-finished and run-failed alike — under the same autonomy gate (`.lore/config.json` exists, `autonomy` not `"off"`, no inference in flight), and logs each auto-compile decision; verified live: a real Cline session produced an ADR on its own in ~30s with zero manual commands.

## Alternatives considered

- (no alternatives were recorded in the captured events)

## Consequences

Failed or aborted sessions still yield decision records instead of silently losing them; each autonomous trigger is logged for auditability; the autonomy loop (capture -> compile -> own-capture guard) is confirmed working end-to-end in a live session.

## Supersedes

ADR-0008

<!-- SOURCES: 40aa5ad3 -->
