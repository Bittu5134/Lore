---
name: lore
description: Show all Lore architectural stats, decision counts, ADR history, and knowledge base details directly in chat.
---

# Lore — Architectural Stats & Overview

When invoked with `/lore` or when asked about Lore statistics and project info:

1. **Collect Current Status & Metrics**:
   - Run `lore status` (or `npx --yes tsx <loreHome>/packages/cli/src/index.ts status`) to inspect:
     - Total accepted ADR count and pending drafts
     - Autonomy mode (auto/manual) and confidence threshold
     - Git hooks status (active hooks, hook path)
     - Raw evidence files and capture events count
   - Read `.lore/wiki/index.md` to see the full list of architectural decisions, their confidence scores, and status.

2. **Present Comprehensive Data Directly in Chat**:
   - **Summary Stats**: Total accepted decisions, pending drafts, confidence average/range, and hook health.
   - **Categorized Breakdown**: Group decisions by theme:
     - *Architecture & Core Patterns*
     - *Inference & Compiler*
     - *Capture & Event Pipeline*
     - *MCP Server & Tooling*
     - *Git Synchronization & Hygiene*
     - *Storage & Scaling*
   - **Decision Timeline**: List the latest 5-10 decisions with ID, title, status, and confidence.
   - **Superseded Decisions**: Explicitly call out any decisions that have been replaced and what replaced them (e.g., ADR-0012 superseding ADR-0005).
   - **Next Actions / Suggestions**:
     - Tell the user how to search the wiki (`lore query <topic>`).
     - Mention if any drafts need review in `.lore/drafts/`.

## Architectural Consultation (Before editing code)
- Read `.lore/wiki/index.md` or call `search_lore` to check existing constraints.
- Follow active ADRs, and record new non-obvious choices into `.lore/drafts/` or via `record_decision`.
