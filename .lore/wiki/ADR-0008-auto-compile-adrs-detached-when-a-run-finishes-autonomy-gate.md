---
id: ADR-0008
title: Auto-compile ADRs detached when a run finishes (autonomy-gated, fail-open)
status: accepted
date: 2026-10-04
confidence: 0.9
sources:
  - d760b86d
  - 94d9b3dd
  - 86786cf0
  - bb3b9bef
  - 697fa9ed
  - 14c2b9ae
  - 62dd7adf
  - aced580b
  - d1ace4cc
tags:
  - autonomy
  - plugin
  - compile
  - capture
---

# ADR-0008: Auto-compile ADRs detached when a run finishes (autonomy-gated, fail-open)

## Context

Lore's promise was that decision records write themselves; until now `lore compile` had to be invoked manually, so sessions whose users forgot it produced no ADRs. The capture plugin already observes every `run-finished` event, and the inference lock added in d760b86d makes recursion impossible.

## Decision

On `run-finished`, when `.lore/config.json` exists, `autonomy` in it is not `"off"`, and no inference is in flight, the plugin spawns a detached `lore compile` (resolved strictly from the `loreHome` recorded by `lore init`, preferring the repo-local tsx binary) with stdio appended to `.lore/meta/compile.log`, then unrefs the child. Every step is wrapped in try/catch so capture never blocks or breaks the agent loop.

## Alternatives considered

- Compile inline in the agent loop — rejected: the agent must never wait minutes for a model call
- Manual `lore compile` — rejected: depends on user discipline; sessions get no ADRs
- Cron/CI-scheduled rollup — rejected: not tied to session end, delays distillation
- Guessing the CLI install path — rejected: a wrong path would make Cline execute a random file on the user's machine

## Consequences

Decisions are distilled automatically at session end; the inference.lock plus LORE_INTERNAL guard makes the spawned compile skip its own capture, so the loop cannot recurse. Users opt out via `autonomy: "off"` in `.lore/config.json`; compile output lands in `.lore/meta/compile.log`.

<!-- SOURCES: d760b86d, 94d9b3dd, 86786cf0, bb3b9bef, 697fa9ed, 14c2b9ae, 62dd7adf, aced580b, d1ace4cc -->
