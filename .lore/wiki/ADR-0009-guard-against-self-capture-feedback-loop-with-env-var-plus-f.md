---
id: ADR-0009
title: Guard against self-capture feedback loop with env var plus filesystem lock
status: accepted
date: 2026-10-04
confidence: 0.92
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
  - capture
  - inference
  - feedback-loop
  - plugin
---

# ADR-0009: Guard against self-capture feedback loop with env var plus filesystem lock

## Context

`lore compile` shells out to `cline -p` (ADR-0002) for inference, and the capture plugin (ADR-0004) was recording the events of Lore's own inference — a runaway feedback loop that pollutes `.lore/raw/` and can recurse. Dogfooding exposed it during a compile/sync run.

## Decision

The compiler writes `.lore/meta/inference.lock` (the plugin checks mtime freshness of 10 minutes) and passes `LORE_INTERNAL=1` in the child env; the capture plugin skips every event while either signal is present. The filesystem lock is the authoritative signal because Cline may run plugins in a sandbox that does not inherit env vars.

## Alternatives considered

- Env var alone — rejected: Cline can sandbox plugins without inheriting the parent env
- Lock without a freshness check — rejected: a crashed compile would leave a stale lock that permanently disables capture
- Dropping the CLI inference backend — rejected: contradicts ADR-0002

## Consequences

Raw evidence stays clean of Lore's own reasoning; the lock is machine-local and gitignored. This guard is what later makes detached auto-compile on run-finished safe (recursion impossible). `lore init` also now creates `.clinerules/` so the continuity rule lands in the target repo.

<!-- SOURCES: d760b86d, 94d9b3dd, 86786cf0, bb3b9bef, 697fa9ed, 14c2b9ae, 62dd7adf, aced580b, d1ace4cc -->
