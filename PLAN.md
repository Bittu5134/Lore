# Lore — Project Plan

**A local architectural knowledge engine that preserves the _why_ behind software decisions.**
Team DietCode · Hackathon build · 5-hour window · parallel-agent execution

---

## 1. Problem & Solution

**Problem.** AI coding agents generate code fast, but their intermediate reasoning and architectural
trade-offs vanish when the task ends. Human commits are often too generic ("Fixed the search algorithm").
Both cause unmaintainable legacy code and lost context across sessions, teammates, and tools.

**Solution.** Lore maintains a living, local wiki of project decisions inside the repository (`.lore/`).
It captures rationale, discarded approaches, and trade-offs that Git diffs can't express — from **both AI
agents and human developers**.

---

## 2. Decisions Locked

| Decision | Choice |
|---|---|
| Capture sources | AI agents **and humans** are both first-class |
| Update autonomy | Fully automatic; low-confidence inferences go to `.lore/drafts/` |
| Integration | Layered: one core + multiple adapters (native hooks for capture, MCP for portability) |
| Inference backend | Shell out to `cline -p` — reuses existing Cline auth, zero API-key setup |
| Scope | Full feature set retained |
| Build strategy | Contracts-first, then 5 parallel lanes |
| Verified env | Cline CLI **3.0.68**, Node **v26.10.0**, auth configured (`~/.cline/data/settings/providers.json`) |

---

## 3. Verified Research (against the installed CLI)

- SDK bundled at `~/.local/lib/node_modules/cline/node_modules/@cline/{sdk,core,agents,llms,shared}`
- Plugin surface: `AgentPlugin` with `setup(api)` + hooks `beforeRun/afterRun/beforeModel/afterModel/beforeTool/afterTool/onEvent`; tools via `createTool`; install with `cline plugin install <file|git|npm|path>`
- **Thought capture events** (in `@cline/shared/dist/agent.d.ts`):
  `assistant-reasoning-delta {iteration,text,accumulatedText,redacted?}`, `assistant-text-delta`,
  `tool-started/tool-updated/tool-finished {toolCall,message?}`, `run-finished {result: AgentRunResult}`
  (`result.messages` = complete transcript), `run-failed {error,errorClass?}` + lifecycle events
- **CLI native hooks:** `--hooks-dir` / `hooks/hooks.json`, payloads via stdin; events `agent_start,
  agent_resume, agent_abort, agent_end, agent_error, tool_call, tool_result, prompt_submit, pre_compact,
  session_shutdown`; PascalCase config keys; exec log at `~/.cline/data/logs/hooks.jsonl`
- **MCP:** CLI `~/.cline/mcp.json`, stdio `{command,args,env,autoApprove[]}`, remote `{type:"streamableHttp"|"sse",url,headers}`
- **Platform constraint:** plugins/hooks = SDK/CLI/Kanban only, NOT VS Code/JetBrains. MCP + rules work everywhere.
- Plugin-declared MCP servers supported (cline PR #11516): synced into `cline_mcp_settings.json`
- Prior art: `@zosmaai/pi-llm-wiki` (4-layer vault), `openwiki` (evidence-tracked wiki). Neither captures in-flight reasoning — **that is Lore's differentiator.**

---

## 4. Feature List

**Capture:** (1) agent thought capture, (2) CLI lifecycle hooks, (3) human git-commit inference,
(4) live fs watcher, (5) backfill, (6) manual capture
**Engine:** (7) `.lore` store, (8) ADR compiler + drafts gating, (9) search index, (10) merge reconciler
**Output:** (11) MCP server, (12) rules/skill injection, (13) Mechanism share/pull, (14) `lore` CLI, (15) plugin packaging

---

## 5. `.lore/` Store Spec (v0)

```
.lore/
  config.json     # autonomy, confidence threshold, inference (cline -p), ignores
  hooks/          # post-commit, post-merge  (git core.hooksPath -> .lore/hooks)
  raw/            # append-only immutable event packets (JSONL)
  wiki/           # ADR-NNNN-*.md + topics/*.md
  meta/           # events.jsonl, state.json (cursor), queue.jsonl
  drafts/         # low-confidence proposals
```

**Frozen contracts** live in `packages/core/src/types.ts` (event envelope, ADR frontmatter, config,
MCP tool schemas, `Compiler` interface). Raw never edited; wiki is compiled output; indexes deterministic.

---

## 6. Integration Decision — hooks vs MCP (both, layered)

MCP tools fire only when the model chooses to call them, so reasoning capture is impossible via MCP alone.

| Layer | Mechanism | Why |
|---|---|---|
| Capture (native) | SDK plugin `onEvent` + CLI `hooks.json` | Only way to see the reasoning stream |
| Query/API | MCP stdio server | Portable, works in VS Code, not locked to Cline |
| Human/any-editor | git hooks + fs watcher | Fully host-independent |
| Continuity | `.clinerules/lore.md` + skill | Zero code, works everywhere |

---

## 7. Architecture

npm workspaces + TypeScript (tsx dev), Node 22+.

- `packages/core` — store, event log, cursor/queue, ADR compiler, drafts gating, index, reconciler logic
- `packages/cli` — `lore` binary: init, sync, watch, backfill, query, share, doctor, hook
- `packages/plugin` — `AgentPlugin` reasoning capture + MCP declaration + bundled rule/skill
  (runtime imports limited to `node:*`; `@lore/core` via `import type` only)
- `packages/mcp` — stdio MCP server: `search_lore`, `get_adr`, `record_decision`

---

## 8. Execution — Contracts-First, 5 Parallel Lanes

Keystone (Lane 0): scaffold + core types + SPECs + fixtures + `.clinerules/lore.md`.

| Lane | Scope | Depends on |
|---|---|---|
| 1 Core engine | store, event log, cursor/queue, compiler (`cline -p`), drafts gating, index | Lane 0 |
| 2 Agent capture | `plugin.ts` onEvent→JSONL, `hooks.json`, SDK-wrapper fallback | Lane 0 |
| 3 MCP server | `search_lore`/`get_adr`/`record_decision` + Cline registration | Lane 0 |
| 4 Human capture | post-commit→sync, backfill, fs watcher | Lane 0 (+ compiler stub) |
| 5 Merge + Mechanism | post-merge reconciler, `lore share`/`pull` | Lane 0 |

| Time | Activity |
|---|---|
| 0:00–0:30 | Lane 0 contracts + scaffold |
| 0:30–3:00 | Lanes 1–5 in parallel (fixtures gate each lane) |
| 3:00–4:00 | Integration + full e2e (risk buffer) |
| 4:00–5:00 | Demo rehearsal ×2, README, roadmap slide |

---

## 9. Demo Script (3 wow moments)

1. **Open the black box** — live Cline session → reasoning + tool trail → ADR with the why + rejected alternatives
2. **Continuity** — fresh agent session consults `.lore/wiki/` before touching code
3. **Works without AI** — human commit → `post-commit` → wiki auto-updates
4. **Merge** — divergent branches → `post-merge` reconciles wiki (both retained)
5. **Share** — `lore share` exports the wiki
6. **Dogfood** — Lore's own `.lore/` documents the build of Lore itself

---

## 10. Risks & Fallbacks

| Risk | Mitigation |
|---|---|
| Plugin load issues | SDK-wrapper fallback (`lore run` = `Agent` + `subscribe`) |
| No reasoning emitted | `--thinking medium`; verify hour 1 |
| MCP/VS Code registration flaky | Fallback to CLI-side MCP config |
| Lane slips past 3:00 | Feature demotes to roadmap slide; demo spine never slips |

