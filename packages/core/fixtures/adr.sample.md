---
id: ADR-0001
title: Extend the JSON config loader instead of adding dotenv
status: accepted
date: 2026-10-04
confidence: 0.82
sources:
  - demo-session-1
tags:
  - config
  - dependencies
---

# ADR-0001: Extend the JSON config loader instead of adding dotenv

## Context

The config loader needed environment overrides. The repo already reads a JSON config file.

## Decision

Extend the existing JSON loader (`src/config.ts`) to accept `process.env.APP_CONFIG` as an
override, keeping a single source of truth.

## Alternatives considered

- **dotenv** — rejected: adds a dependency and a second file to keep in sync with the JSON config.

## Consequences

No new dependency. Env overrides are parsed at module load, so malformed JSON fails fast at startup.

<!-- SOURCES: demo-session-1 (2026-10-04) -->
