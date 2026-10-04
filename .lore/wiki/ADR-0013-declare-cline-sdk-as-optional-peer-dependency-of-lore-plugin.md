---
id: ADR-0013
title: Declare @cline/sdk as optional peer dependency of @lore/plugin
status: accepted
date: 2026-10-04
confidence: 0.6
sources:
  - 4ac35f0a
tags:
  - plugin
  - packaging
  - dependency
  - cline
---

# ADR-0013: Declare @cline/sdk as optional peer dependency of @lore/plugin

## Context

Commit 4ac35f0a adds @cline/sdk ^0.0.90 to @lore/plugin's dependencies and as a peerDependency with peerDependenciesMeta optional:true, while the plugin source still imports only node:* modules and local type shims (./types.ts), never the SDK directly.

## Decision

Document the host-provided SDK contract as an optional peer dependency (plus a root workspace dependency for dev resolution) while keeping compile-time types decoupled through local shims, so the plugin remains inert where Cline does not supply the SDK.

## Alternatives considered

- Hard runtime dependency on @cline/sdk — rejected: Cline hosts the plugin and provides the SDK at runtime, so a hard dep risks duplication and install churn
- No declared dependency — rejected: leaves the plugin/host contract implicit and untyped for consumers

## Consequences

npm can resolve the SDK for development and typechecking while the plugin stays loadable in environments that lack it; capture behavior (ADR-0004's onEvent hook) is unchanged.

<!-- SOURCES: 4ac35f0a -->
