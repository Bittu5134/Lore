---
name: lore
description: Show Lore architectural memory stats, decisions, and open the visual dashboard in your browser. Also guides architectural consultation before modifying code.
---

# Lore — Architectural Memory, Stats & Graph

When invoked with `/lore` or when asked about Lore statistics:

1. **Check Status**: Run `lore status` (or `npx --yes tsx <loreHome>/packages/cli/src/index.ts status`) to collect metrics:
   - Total accepted ADRs and pending drafts.
   - Autonomy mode, confidence threshold, and git hook status.
   - Recent evidence and capture files.
2. **Generate Visual Graph**: Run `lore graph` (or `npx --yes tsx <loreHome>/packages/cli/src/index.ts graph`). This writes a self-contained interactive SVG decision graph to `.lore/wiki/graph.html`.
3. **Present Statistics**:
   - Total ADRs grouped by categories (Architecture, Capture, MCP, Git Sync, Storage).
   - Any superseded decisions (e.g., ADR-0012 superseding ADR-0005).
   - Any pending drafts awaiting review in `.lore/drafts/`.
4. **Open in Web Browser**:
   - Provide a direct clickable link to the user: `file://<absolute-repo-path>/.lore/wiki/graph.html`.
   - Ask or run `xdg-open .lore/wiki/graph.html` (Linux) / `open .lore/wiki/graph.html` (macOS) / `start .lore/wiki/graph.html` (Windows) to pop open the visual graph in their default browser.

## Architectural Consultation (Before editing code)
- Read `.lore/wiki/index.md` or call `search_lore` to check existing constraints.
- Follow active ADRs, and record new decisions into `.lore/drafts/` or via `record_decision`.
