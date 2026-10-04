---
id: ADR-0018
title: Make /lore skill show stats and open an interactive SVG graph in the browser
status: accepted
date: 2026-10-04
confidence: 0.5
sources:
  - 484340d1
tags:
  - skill
  - plugin
  - dashboard
  - graph
  - cli
---

# ADR-0018: Make /lore skill show stats and open an interactive SVG graph in the browser

## Context

The /lore skill in packages/plugin/skills/lore/SKILL.md was a passive guide: read .lore/wiki/index.md and 2-3 matching ADRs before editing code, record decisions while working, and state consulted ADRs at the end. Commit 484340d1 rewrites it into an active dashboard workflow triggered by /lore or questions about Lore statistics.

## Decision

The skill now directs the agent to (1) run `lore status` (or `npx --yes tsx <loreHome>/packages/cli/src/index.ts status`) to collect metrics — accepted ADRs, pending drafts, autonomy mode, confidence threshold, git hook status, recent evidence/capture files; (2) run `lore graph` to write a self-contained interactive SVG decision graph to .lore/wiki/graph.html; (3) present stats grouped by category (Architecture, Capture, MCP, Git Sync, Storage) plus superseded decisions (e.g., ADR-0012 superseding ADR-0005) and pending drafts in .lore/drafts/; (4) open the graph via a file://<absolute-repo-path>/.lore/wiki/graph.html link or by running xdg-open/open/start per OS. The pre-edit architectural consultation guidance is retained only as a compact secondary section.

## Alternatives considered

- Keep /lore as a passive pre-edit wiki-reading checklist — this is the workflow the commit removes; the events record no explicit rationale for switching to the dashboard-first behavior

## Consequences

/lore now depends on the lore CLI exposing working status and graph commands; graph output lives at .lore/wiki/graph.html as a self-contained interactive SVG; invoking /lore makes the agent run shell commands and possibly open the user's browser; the consultation guidance still exists but is demoted from the headline behavior.

<!-- SOURCES: 484340d1 -->
