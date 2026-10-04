---
id: ADR-0002
title: Shell out to the local Cline CLI (`cline -p`) as Lore's ADR inference backend
status: accepted
date: 2026-10-04
confidence: 0.82
sources:
  - PLAN.md
  - packages/core/SPEC.md
  - packages/core/src/compiler.ts
  - packages/cli/src/commands/sync.ts
  - packages/cli/src/commands/backfill.ts
  - commit dbf6172
  - commit 2b00b9af
  - 15e554be
  - beb35be8
  - afd248b3
  - 261b5cdc
  - dbf61729
  - 2b00b9af
tags:
  - inference
  - cline-cli
  - adr-compiler
  - dependencies
  - architecture
---

# ADR-0002: Shell out to the local Cline CLI (`cline -p`) as Lore's ADR inference backend

## Context

Lore must convert captured raw events (agent reasoning, CLI lifecycle hooks, git commits) into ADRs, which requires an LLM inference step that turns a transcript into a single structured decision object. Constraints: a 5-hour hackathon build executed by parallel agents, a desire to avoid API-key/provider setup, and the goal of working within the Cline environment the team already had installed. PLAN.md records the verified environment as Cline CLI 3.0.68, Node v26.10.0, with auth already configured at ~/.cline/data/settings/providers.json, and lists 'Inference backend: Shell out to `cline -p` — reuses existing Cline auth, zero API-key setup' as a locked decision. It also records the platform constraint that native hooks/plugins only exist in the SDK/CLI (not VS Code/JetBrains), while the compiler is the single shared step every capture lane feeds.

## Decision

Invoke the installed Cline CLI as the inference engine rather than integrating an LLM API directly. The core compiler (`packages/core/src/compiler.ts`) builds a prompt that DEMANDS one JSON object ({title, context, decision, alternatives[], consequences, confidence, tags[], sources[]}) and shells out via `execFileSync('cline', ['-p', prompt, '--cwd', repoRoot, '--thinking', config.inference.thinking ?? 'medium', ...])`, reusing the developer's existing Cline auth. The returned JSON is parsed (tolerating  fences) and mapped into an ADR, with routing to `wiki/` or `drafts/` based on the autonomy/confidence threshold. The compiler sits behind a `Compiler` interface so tests inject a fake inference function and never call `cline`.

## Alternatives considered

- Integrate an LLM provider SDK / direct API calls — rejected: requires API keys and per-provider configuration, duplicating the auth the team already had in Cline and adding setup risk inside the hackathon window.
- Capture reasoning through MCP tools — rejected: MCP tools fire only when the model chooses to call them, so they cannot observe the in-flight reasoning stream (PLAN.md §6 states reasoning capture is impossible via MCP alone).
- Rely on human-written ADRs or git commit messages — rejected: the project's premise is that human commits are too generic ('Fixed the search algorithm') and AI reasoning vanishes, so manual authoring is the problem being solved, not a solution.
- Build a bespoke/standalone inference integration independent of the installed CLI — rejected implicitly in favor of reusing the already-installed and already-authenticated Cline CLI, keeping the tool local with zero API-key setup.

## Consequences

Lore inherits zero API-key setup and reuses existing Cline auth, keeping inference local and offline-friendly. The cost is tight coupling to the Cline CLI: because `cline -p` prints `[thinking]` text to stdout and can emit unescaped control characters inside JSON strings, a naive first-brace/last-brace parse was insufficient, so the compiler grew a robust extractor — balanced-brace JSON candidate scanning plus control-character repair (`repairControlChars`) — and gained dedicated tests (commit 2b00b9af, 'robust JSON extraction'). Inference now requires the `cline` binary to be installed and authenticated on the machine, and the parser must track Cline output-format changes (verified against CLI 3.0.68). Because all inference flows through one `Compiler` interface, tests stub it and never touch the network or the CLI.

<!-- SOURCES: PLAN.md, packages/core/SPEC.md, packages/core/src/compiler.ts, packages/cli/src/commands/sync.ts, packages/cli/src/commands/backfill.ts, commit dbf6172, commit 2b00b9af, 15e554be, beb35be8, afd248b3, 261b5cdc, dbf61729, 2b00b9af -->
