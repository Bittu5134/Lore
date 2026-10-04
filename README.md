# Lore

**A local architectural knowledge engine.** It records *why* code is the way it is — whether the code
was written by an AI agent or a human — and keeps those reasons inside the repository, next to the code,
so the next person (or the next agent session) understands the constraints before changing anything.

---

## The problem

AI coding agents write code fast, and their reasoning evaporates the moment the task ends. Human commit
messages are usually too thin to help ("fix search"). Both produce the same outcome: **unmaintainable
code and lost context**.

## What Lore does

1. **Captures the reasoning** — while a Cline agent works, a Lore plugin records its inner monologue and
   every tool call. When a human commits, a git hook records the diff and infers the rationale.
2. **Compiles decision records** — captured evidence is distilled into ADRs (architecture decision
   records) written as plain markdown: *context, decision, alternatives rejected, consequences*.
3. **Gives it back** — agents read the wiki before editing (continuity), humans search it, and an MCP
   server exposes it to any MCP client.

Everything lives in a `.lore/` folder in the repo. Raw evidence is local; the curated ADRs are committed
and shared with the team.

---

## Quickstart (60 seconds, one command)

```bash
npm run setup    # checks the environment and installs everything

# then just work — Lore captures Cline sessions and commits on its own

lore             # the dashboard: what it saw, decided, and is waiting on
```

That's it. To see it end-to-end without touching your own repo, run the self-narrating demo:

```bash
npm run demo     # offline by default; --live for real model calls
```

**The three beats:** `lore init` once → work normally (agent or human) → `lore query` to ask why.
Everything else (`review`, `sync`, `graph`, `share`, …) is there when you need it — you almost never do.

See **[docs/demo.md](docs/demo.md)** for the demo walkthrough, **[docs/judge.md](docs/judge.md)** for architecture and scoring details, and below for the full command reference.

---

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

**Inference** shells out to the local `cline` CLI (`cline -p`), so Lore reuses your existing Cline auth —
no API keys, no extra provider setup. Tests inject a fake inference function and never call a model.

**Autonomy**: results with confidence ≥ `config.confidenceThreshold` (default 0.60) are written straight to
`wiki/`; anything less goes to `drafts/` for review.

---

## Repository layout

npm workspaces + TypeScript (run through `tsx`, no build step), Node 22+.

| Package | Responsibility |
|---|---|
| `packages/core` | store, event log, ADR markdown, the compiler (prompt + robust JSON extraction), search |
| `packages/cli` | the `lore` command |
| `packages/plugin` | Cline capture plugin (`onEvent` → `raw/`) |
| `packages/mcp` | zero-dependency stdio MCP server |

Frozen interfaces live in `packages/core/src/types.ts` (`CONTRACTS_VERSION`); each package has a `SPEC.md`
describing its behaviour and acceptance criteria. `docs/plan.md` is the original build plan.

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

Run any command with `npx --yes tsx packages/cli/src/index.ts <cmd>`, or link the shim once:
`npm link ./packages/cli` (then `lore <cmd>` on your PATH).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Node ... is too old` | Lore needs Node 22+ (`fs.watch` recursive, node:test) |
| `compile` hangs or errors about `cline` | Install/authenticate Cline (`npm i -g cline && cline auth`), or use `compile --fixture` |
| Hooks don't fire | `git config core.hooksPath` must be `.lore/hooks` — `lore doctor` checks this; if you use husky, `lore init` saved the previous path to `.lore/meta/previous-hooks-path.txt` |
| Plugin edits don't take effect | `cline plugin install --force` reuses its cached directory. Run `cline plugin uninstall lore && cline plugin install ./packages/plugin`, or copy `packages/plugin/src/index.ts` over the installed copy |
| `npm test` fails on a fresh clone | Run `npm install` first (workspace links `@lore/*`) |

## Status & where it scales

**Working today, verified end-to-end:** capture from live agent sessions (reasoning + tool trail),
human commit capture via hooks, ADR compilation with a real model, offline fixture mode, FTS search +
MCP, draft review, supersession, cross-repo sharing, merge reconciliation, the watcher, a secrets
audit, and an HTML decision graph. 29 automated tests cover core; all packages type-check;
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
