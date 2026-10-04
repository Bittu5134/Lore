# Lore

**A local architectural knowledge engine.** It records *why* code is the way it is — whether the code
was written by an AI agent or a human — and keeps those reasons inside the repository, next to the code,
so the next person (or the next agent session) understands the constraints before changing anything.

> **The problem.** AI coding agents write code fast, and their reasoning evaporates the moment the task
> ends. Human commit messages are usually too thin to help ("fix search"). Both produce the same outcome:
> **unmaintainable code and lost context.**
>
> **What Lore does.**
> 1. **Captures the reasoning** — while a Cline agent works, a Lore plugin records its inner monologue
>    and every tool call. When a human commits, a git hook records the diff and infers the rationale.
> 2. **Compiles decision records** — captured evidence is distilled into ADRs (architecture decision
>    records) written as plain markdown: *context, decision, alternatives rejected, consequences*.
> 3. **Gives it back** — agents read the wiki before editing (continuity), humans search it, and an MCP
>    server exposes it to any MCP client.

Everything lives in a `.lore/` folder in the repo. Raw evidence is local; the curated ADRs are committed
and shared with the team. Git records what changed — Lore records why.

---

## Quickstart on a completely new system

### 0. Prerequisites (one time, machine level)

| Requirement | Why | Install |
|---|---|---|
| **Node.js ≥ 22** | `node:sqlite` (FTS5), recursive `fs.watch`, `node:test` | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| **git** | hooks, commit capture, merge reconciliation | any recent version |
| **Cline CLI** *(optional)* | live model inference + agent capture | `npm install -g cline` |

Verify:

```bash
node -v    # must be v22 or newer
git --version
```

> **No Cline account?** Everything below still works in **fixture mode** (deterministic,
> offline, no model call). The Cline CLI is only needed for *live* ADR compilation with a
> real model and for capturing live agent sessions.

### 1. Clone, install, set up — three commands

```bash
git clone https://github.com/Bittu5134/Lore.git
cd Lore
npm install       # installs the npm workspace (core, cli, plugin, mcp)
npm run setup     # validates the environment and installs everything
```

`npm run setup` checks (and fixes) each of these in order:

1. Node version ≥ 22
2. dependencies installed
3. `tsx` TypeScript runtime actually runs (npm sometimes blocks esbuild's postinstall)
4. Cline CLI present and authenticated *(skipped gracefully if not — fixture mode is fine)*
5. **installs the Lore capture plugin into Cline** (clears stale plugin caches first)
6. runs the full test suite (36 tests) and type-checks every package

A green setup means the machine is ready. If anything fails, the script prints the exact fix.

### 2. Make the `lore` command available on your PATH (recommended)

```bash
npm link ./packages/cli     # run once; creates a global `lore` shim
lore --help
```

No global link? Every command in this guide also works as
`npx --yes tsx packages/cli/src/index.ts <cmd>` from inside the repo, and
`node packages/cli/bin/lore <cmd>` works directly too.

### 3. Try it — the self-narrating demo (60 seconds, offline)

```bash
npm run demo                 # fully offline: fixtures, no API keys, no typing
npm run demo -- --live       # same demo, but a real Cline run (needs `cline auth`)
```

The demo builds a throwaway playground in `/tmp/lore-demo`: `lore init` → an agent session
is captured → the decision writes itself → `lore query` answers why → a human commit is
documented by the git hook → an HTML decision graph is generated. No model call unless you
pass `--live`.

### 4. Use it on *this* repository (Lore documents itself)

This repo runs Lore on itself — `.lore/wiki/` already contains 26 real ADRs written while
Lore was being built. Explore the features without touching your own repos:

```bash
lore status                  # the dashboard: what Lore saw, decided, is waiting on
lore query config            # search the wiki: why is config done this way?
lore query "raw evidence"
lore graph                   # writes .lore/wiki/graph.html — open it in a browser
lore digest --limit 10       # markdown summary of recent decisions (PR-friendly)
lore audit                   # scan the wiki + raw evidence for secrets (exit 1 = found)
lore doctor                  # verify this installation end to end
```

Read a full decision record the way an agent would before editing:

```bash
cat .lore/wiki/index.md
cat .lore/wiki/ADR-0002-*.md   # e.g. "Shell out to the local Cline CLI as Lore's inference backend"
```

---

## Using Lore on Cline CLI

Lore integrates with the Cline CLI in three ways. Steps 1–2 are done **once per repo** by
`lore init`; step 3 is done **once per machine** by `npm run setup` (or manually below).

### a. The capture plugin (agent reasoning → evidence)

The plugin (`packages/plugin`) hooks into Cline's runtime via `@cline/sdk`:

- `hooks.onEvent` streams **live reasoning deltas**, tool calls/results, and run
  completions into `.lore/raw/*.jsonl` — the append-only evidence store.
- `setup()` injects the **continuity rule**: every session starts knowing what was decided
  here (`.clinerules/lore.md` — "read the wiki before you edit; supersede explicitly").
- It **auto-registers the Lore MCP server** with Cline.

Install / refresh it:

```bash
cline plugin install ./packages/plugin      # or: npm run setup
cline plugin list                           # verify
```

If plugin edits don't take effect, `--force` reuses Cline's cached directory — clear it:

```bash
cline plugin uninstall lore && cline plugin install ./packages/plugin
```

### b. The git hooks (human commits → evidence)

`lore init` sets `git core.hooksPath=.lore/hooks`. The `post-commit` hook runs
`lore sync` (commit → ADR) and `post-merge` runs `lore reconcile` (repair divergent wiki
edits after a merge). Zero AI needed for capture; compilation happens in the background.

### c. The MCP server (search + record from any client)

```bash
lore mcp --install      # registers the server in ~/.cline/mcp.json (auto-approves read tools)
lore mcp                # or run the stdio server manually
```

Tools exposed to any MCP client (Cline CLI, VS Code extension, or other):

| Tool | Purpose |
|---|---|
| `search_lore` | Search the wiki of ADRs — call before changing code |
| `get_adr` | Read one ADR by id (`ADR-0001`) |
| `record_decision` | Record a decision the agent just made |

Manual registration — add to `~/.cline/mcp.json`:

```json
{
  "mcpServers": {
    "lore": {
      "command": "npx",
      "args": ["--yes", "tsx", "/abs/path/to/Lore/packages/mcp/src/index.ts"],
      "env": { "LORE_ROOT": "/abs/path/to/your/repo" },
      "autoApprove": ["search_lore", "get_adr"]
    }
  }
}
```

Verify with `cline config mcp --json`.

### d. Live inference (the ADR writer)

Lore compiles evidence into ADRs by shelling out to the local, authenticated Cline CLI —
reusing your existing Cline auth, no extra API keys:

```bash
cline auth        # once per machine, if not already authenticated
```

No auth / offline? Use fixture mode anywhere: `lore compile --fixture`.

---

## Using Lore in your own repository

```bash
cd your-repo
lore init                 # creates .lore/, installs hooks, writes .clinerules/lore.md
# ...just work normally. Cline sessions are captured by the plugin, commits are
# documented by the hook, and decisions are written automatically when a run ends.
lore query <words>        # ask why something is the way it is
```

That's the whole product — on a normal day you run **nothing**. Read the results in
`.lore/wiki/` (`index.md` lists every decision).

## How it works

```
.lore/
  config.json   autonomy, confidence threshold, inference settings, ignores
  hooks/        post-commit + post-merge  (activated via git core.hooksPath)
  raw/          append-only evidence: agent events, commits, edit sessions  (LOCAL, git-ignored)
  wiki/         the knowledge: ADR-NNNN-*.md + index.md                     (committed, shared)
  drafts/       low-confidence ADRs awaiting review                        (committed)
  meta/         bookkeeping: cursor state, queue
```

**Four moving parts**

| Part | Role |
|---|---|
| `lore` CLI | `init`, `compile`, `sync`, `backfill`, `watch`, `query`, `share`, `pull`, `reconcile`, `hook`, `mcp`, `doctor` |
| Cline plugin | hooks `onEvent` → appends reasoning + tool events to `raw/`; injects the decision index as a rule (continuity); registers the MCP server |
| Git hooks | `post-commit` → `lore sync`; `post-merge` → `lore reconcile` |
| MCP server | stdio JSON-RPC: `search_lore`, `get_adr`, `record_decision` — works in any MCP client |

**Inference** shells out to the local `cline` CLI (`cline -p`), so Lore reuses your existing Cline
auth — no API keys, no extra provider setup. Tests inject a fake inference function and never call
a model.

**Autonomy**: results with confidence ≥ `config.confidenceThreshold` (default 0.60) are written
straight to `wiki/`; anything less goes to `drafts/` for review.

## Repository layout

npm workspaces + TypeScript (run through `tsx`, no build step), Node 22+.

| Package | Responsibility |
|---|---|
| `packages/core` | store, event log, ADR markdown, the compiler (prompt + robust JSON extraction), search |
| `packages/cli` | the `lore` command |
| `packages/plugin` | Cline capture plugin (`onEvent` → `raw/`) |
| `packages/mcp` | zero-dependency stdio MCP server |

Frozen interfaces live in `packages/core/src/types.ts` (`CONTRACTS_VERSION`); each package has a
`SPEC.md` describing its behaviour and acceptance criteria. `docs/plan.md` is the original build plan.

## Command reference

| Command | What it does |
|---|---|
| `lore init [--no-hooks]` | Create `.lore/`, install git hooks, write the agent continuity rule |
| `lore compile [--fixture] [--all]` | Turn new evidence into ADRs (`--fixture` = no model call) |
| `lore sync [--auto]` | Commit → ADR (used by the post-commit hook) |
| `lore backfill [--full]` | Document an existing repository's history in batches |
| `lore watch` | Capture the editing session between commits |
| `lore query <words> [--all]` | Search the wiki (SQLite FTS when built; `--all` includes linked repos) |
| `lore review [id\|--all]` | Triage drafts → accepted (`promoteAdr`) |
| `lore supersede <id> [--by <id>]` | Retire a decision, citing its replacement |
| `lore index` | Rebuild `wiki/index.md` + the SQLite FTS index |
| `lore audit` | Scan raw evidence and the wiki for secrets (exit 1 on findings — CI-safe) |
| `lore digest [--limit N]` | Markdown summary of recent decisions (for PR comments / release notes) |
| `lore graph` | Write a self-contained HTML graph of the wiki (nodes = ADRs, edges = supersedes + shared tags) |
| `lore link add\|remove\|list` | Manage related repositories; search them together with `query --all` |
| `lore rollup [--month YYYY-MM] [--write]` | Synthesise a theme ADR over a period (dry run by default) |
| `lore share [--out f]` / `lore pull f` | Export / import a portable knowledge bundle |
| `lore reconcile` | After a merge: resolve wiki conflicts and renumber duplicate ids |
| `lore mcp [--install]` | Run the MCP server, or register it in `~/.cline/mcp.json` |
| `lore doctor` | Verify the whole installation and print the fix for each problem |

## Every feature, demonstrated on this repository

Clone of the repo is a working demo — every feature can be exercised on Lore's own wiki:

```bash
git clone https://github.com/Bittu5134/Lore.git && cd Lore
npm install && npm run setup && npm link ./packages/cli

lore status                     # 1. dashboard — 26 accepted ADRs, hooks, capture stats
lore query config               # 2. FTS search — "why is config done this way?"
lore query "raw evidence" --all # 3. cross-repo search (add links first: lore link add <path>)
lore graph                      # 4. HTML decision graph → .lore/wiki/graph.html
lore digest --limit 5           # 5. markdown digest (paste into a PR)
lore audit                      # 6. secrets audit across evidence + wiki (CI-safe)
lore review --all               # 7. triage low-confidence drafts → accepted wiki
lore rollup --month 2026-10     # 8. synthesise a theme ADR for a period (dry run; add --write)
lore share --out bundle.json    # 9. export the wiki as a portable bundle
lore doctor                     # 10. full installation health check
```

Then use the repo as a real Cline playground:

```bash
cline                              # interactive Cline session in this repo
cline -p "explain ADR-0002"        # one-shot: the agent reads .clinerules/lore.md and
                                   # answers using the wiki (continuity rule in action)
cline mcp                          # the lore MCP server is already registered
```

Ask the agent in-session: *"search_lore for why the MCP server is hand-rolled"* — it will call
the `search_lore` tool, read the ADR, and answer with the actual reasoning (ADR-0005, later
superseded by ADR-0012 when the official SDK was adopted — a real supersession chain you can
inspect with `lore query supersede`).

## CI

`.github/workflows/lore.yml` runs on every push/PR: type-check, the 36-test suite, the secrets
audit, a wiki/search index rebuild, and a decision digest artifact.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Node ... is too old` | Lore needs Node 22+ (`fs.watch` recursive, node:test) |
| `tsx` fails to run | `npm rebuild esbuild` (npm sometimes blocks its postinstall) |
| `compile` hangs or errors about `cline` | Install/authenticate Cline (`npm i -g cline && cline auth`), or use `compile --fixture` |
| Hooks don't fire | `git config core.hooksPath` must be `.lore/hooks` — `lore doctor` checks this; if you use husky, `lore init` saved the previous path to `.lore/meta/previous-hooks-path.txt` |
| Plugin edits don't take effect | `cline plugin install --force` reuses its cached directory. Run `cline plugin uninstall lore && cline plugin install ./packages/plugin`, or copy `packages/plugin/src/index.ts` over the installed copy |
| `npm test` fails on a fresh clone | Run `npm install` first (workspace links `@lore/*`) |

## Status & where it scales

**Working today, verified end-to-end:** capture from live agent sessions (reasoning + tool trail),
human commit capture via hooks, ADR compilation with a real model, offline fixture mode, FTS search +
MCP, draft review, supersession, cross-repo sharing, merge reconciliation, the watcher, a secrets
audit, and an HTML decision graph. 36 automated tests cover core and CLI; all packages type-check;
`npm run setup` and `lore doctor` both come back green on a fresh clone.

**Scaling work already in place** (for a repository with years of history and many contributors):
raw evidence is git-ignored and **partitioned by month** with cursor-skipping reads; the wiki index is
built on demand instead of on every write; search uses a **SQLite FTS5** index when the runtime
supports it (linear scan otherwise); `lore rollup` summarises a period into theme ADRs linked by
`supersedes`; secrets are ignored by default, redacted on capture, and auditable in CI.

See **[docs/scaling.md](docs/scaling.md)** for the full table plus what remains
(retention/compaction of old partitions, scheduled rollups, per-author id namespacing, incremental FTS).

## Team

Built by **Team DietCode** for the hackathon. Concept: [`concept/`](concept/).
