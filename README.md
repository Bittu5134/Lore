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

## Quickstart (60 seconds)

```bash
git clone <this repo> && cd Lore
npm install
npm run setup          # checks Node/cline, installs the Cline plugin, runs doctor

# prove the pipeline with NO model call (works offline / without Cline auth):
mkdir -p /tmp/demo && cd /tmp/demo && git init -q
npx --yes tsx "$OLDPWD/packages/cli/src/index.ts" init
cp "$OLDPWD/packages/core/fixtures/session.sample.jsonl" .lore/raw/session.jsonl
npx --yes tsx "$OLDPWD/packages/cli/src/index.ts" compile --fixture
cat .lore/wiki/ADR-*.md      # <- a decision record, with rejected alternatives
```

With Cline installed and authenticated (`cline auth`), replace `--fixture` with a real run:

```bash
cline -p "make the config loader accept an APP_CONFIG override" --cwd /tmp/demo   # agent works; Lore captures it
npx --yes tsx "$OLDPWD/packages/cli/src/index.ts" compile                          # real inference -> ADR
```

See **[DEMO.md](DEMO.md)** for the full 5-minute judge script.

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
| Cline plugin | hooks `onEvent` on the agent runtime → appends reasoning + tool events to `raw/` |
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
describing its behaviour and acceptance criteria. `PLAN.md` is the original build plan.

## Command reference

| Command | What it does |
|---|---|
| `lore init [--no-hooks]` | Create `.lore/`, install git hooks, write the agent continuity rule |
| `lore compile [--fixture] [--all]` | Turn new evidence into ADRs (`--fixture` = no model call) |
| `lore sync [--auto]` | Commit → ADR (used by the post-commit hook) |
| `lore backfill [--full]` | Document an existing repository's history in batches |
| `lore watch` | Capture the editing session between commits |
| `lore query <words>` | Search the wiki (no args = list) |
| `lore share [--out f]` / `lore pull f` | Export / import a portable knowledge bundle |
| `lore reconcile` | After a merge: resolve wiki conflicts and renumber duplicate ids |
| `lore mcp` | Run the MCP server (see `packages/mcp/README.md` to register it) |
| `lore doctor` | Verify the whole installation and print fixes |

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

**Working today, verified end-to-end:** capture from live agent sessions (reasoning + tool trail), human
commit capture via hooks, ADR compilation with a real model, offline fixture mode, search/MCP, sharing,
merge reconciliation, and the watcher. 24 automated tests cover core; all packages type-check.

**Known limits at scale** (a 2-year, hundreds-of-contributors repo): raw evidence read/parsed as one log,
a wiki index rewritten per write, linear search, and per-commit inference cost. The planned fix is a
storage swap (SQLite + FTS5, out-of-git raw, monthly partitions) plus hierarchical rollups
(session → day → month → theme) with `supersedes` links — none of which changes the concept.
`README`-level honesty beats an implausible claim.

## Team

Built by **Team DietCode** for the hackathon. Concept: [`concept/`](concept/).
