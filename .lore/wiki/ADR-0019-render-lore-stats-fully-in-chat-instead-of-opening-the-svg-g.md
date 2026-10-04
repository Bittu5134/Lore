---
id: ADR-0019
title: Render /lore stats fully in chat instead of opening the SVG graph in a browser
status: accepted
date: 2026-10-04
confidence: 0.72
sources:
  - b6b20919
tags:
  - skill
  - ux
  - chat-output
  - supersession
---

# ADR-0019: Render /lore stats fully in chat instead of opening the SVG graph in a browser

## Context

The /lore skill definition (packages/plugin/skills/lore/SKILL.md) previously instructed the agent to run `lore status` for metrics, then run `lore graph` to write a self-contained interactive SVG to .lore/wiki/graph.html, then open it in the user's default browser via a file:// link or xdg-open/open/start. ADR-0018 recorded that browser-graph behavior.

## Decision

The skill now drops the graph-generation and browser-opening steps entirely. It runs `lore status`, reads `.lore/wiki/index.md` for the full decision list with confidence scores and status, and presents everything directly in chat: summary stats (accepted ADRs, pending drafts, confidence average/range, hook health), a themed category breakdown (Architecture & Core Patterns, Inference & Compiler, Capture & Event Pipeline, MCP Server & Tooling, Git Sync & Hygiene, Storage & Scaling), a timeline of the latest 5-10 decisions with ID/title/status/confidence, and explicit superseded-decision callouts. The skill description is rewritten from 'open the visual dashboard in your browser' to 'show all Lore architectural stats, decision counts, ADR history, and knowledge base details directly in chat'.

## Alternatives considered

- Keep the previous flow (run `lore graph`, write .lore/wiki/graph.html, open the interactive SVG in the default browser) — rejected by its removal from the skill; a chat-only render avoids requiring a browser launch or GUI on every invocation and keeps the full decision detail (timeline, supersession, confidence) visible instead of a graph-only view

## Consequences

/lore now works in any chat surface with no browser dependency. The skill no longer references `lore graph` or xdg-open/open/start, though the CLI graph command presumably still exists for manual use. Users lose the automatic interactive graph view unless they invoke the graph command themselves.

## Supersedes

ADR-0018

<!-- SOURCES: b6b20919 -->
