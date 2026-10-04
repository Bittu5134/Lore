# Lore — Judge's Guide

**A local architectural knowledge engine that remembers *why* code is the way it is.**
Team DietCode

---

## The problem (in one breath)

AI coding agents write code fast, and their reasoning **evaporates** the moment the task ends.
Human commit messages are too thin to help ("fix search"). Both produce the same thing:
**unmaintainable code and lost context.** You can read *what* changed — you can never ask *why*.

## What Lore is

Lore keeps a living wiki of decisions **inside the repository** (`.lore/`). It captures the
rationale — the context, the alternatives that were *rejected*, the trade-offs — from **both AI
agents and human developers**, and keeps it next to the code so the next person (or the next
agent session) reads it before changing anything.

**One sentence:** *Git records what changed. Lore records why.*

---

## How to run it (60 seconds)

```bash
npm run setup     # checks the environment, installs everything
npm run demo      # self-narrating, works OFFLINE (no model key needed)
```

That's it. `npm run demo` plays the whole product back to you with `SAY:` narration.
To watch it work live with a real agent: `npm run demo -- --live` (needs `cline auth`).

**The three beats you'll see:**

1. `lore init` — one command sets everything up (store, git hooks, agent rule)
2. *An agent edits code* — you type nothing; Lore captures its reasoning and, when the run
   ends, **writes the decision record on its own**
3. `lore query dotenv` — ask why, get the decision with the rejected alternatives

And the human path: `git commit` a change by hand → the `post-commit` hook documents it
automatically. **No AI involved.**

---

## How it scores against the criteria

### 1 · Innovation & Originality

Existing "AI documentation" tools (OpenWiki, pi-llm-wiki, README generators) all document
the **final code**. Lore is the only one that captures the **in-flight reasoning stream** of a
running agent — the "I'm in Plan mode… wait, actually act mode" inner monologue — and distils
it into architecture decision records before it evaporates.

That distinction is the product. And it **dogfoods**: Lore's own `.lore/wiki/` contains 11 ADRs
written *by Lore, about building Lore* — the tool proving itself on its own history.

### 2 · Real-World Usefulness

- **For AI-assisted work:** future sessions stop re-litigating past decisions (the continuity
  beat — a fresh agent reads the wiki before touching code).
- **For humans:** a commit with message "feat: add retry count" becomes a full record of *why*
  retries were added, with the alternatives that were considered — automatically, on commit.
- **For teams:** `lore share`/`pull` hand knowledge between repos; `lore link` searches related
  projects together; `lore reconcile` merges divergent wikis keeping *both* sides.
- **Privacy built in:** secrets are ignored, redacted on capture, and auditable (`lore audit`).

### 3 · Effective Use of Cline (SDK + deep integration)

Lore is built *on* Cline, not just near it:
- A **Cline plugin** hooks `onEvent` on the agent runtime (`assistant-reasoning-delta`,
  `tool-started/finished`, `run-finished/failed`) — the only way to see the reasoning stream.
- It registers a **continuity rule** (injects the repo's decision index into every session) and
  **auto-registers the Lore MCP server**, so `search_lore`/`record_decision`/`get_adr` work in
  the **VS Code extension** too, where plugins/hooks are unavailable.
- Inference shells out to the local `cline -p`, reusing your existing Cline auth — **zero API keys**.
- `scripts/setup.mjs` installs the plugin and verifies the whole stack (`npm run setup`).

### 4 · Usability & Execution

The autonomy is the usability:
- **After `lore init`, you run nothing on a normal day.** Sessions end → ADRs write themselves.
  Commits land → hooks document them.
- Bare `lore` opens a **dashboard**, not a wall of commands (decisions, drafts, last capture,
  hooks status, 3 suggested next actions).
- `lore doctor` checks the whole install and prints the *fix* for each problem.
- `npm run demo` narrates itself and runs **offline** — a judge with no model key still sees it.
- Drafts gate low-confidence inferences (`confidence < 0.60` → `.lore/drafts/` → `lore review`).

### 5 · Technical Implementation

- **Verified live, on the record:** a real Cline session → an ADR appeared **on its own in ~30 s,
  with zero manual commands** (this is in the repo history and reproducible).
- **36 automated tests**, all passing; **all 4 packages type-check** clean; `npm run setup` and
  `lore doctor` both report green on a fresh clone.
- Monorepo: `core` (store/compiler/events/ADR + SQLite FTS search) · `cli` (the `lore` command) ·
  `plugin` (Cline capture + continuity) · `mcp` (zero-dependency stdio server).
- Scaling is thought through and honest — `docs/scaling.md` lists what's in place (git-ignored raw
  evidence, month-partitioned logs, on-demand index, FTS5 search, rollups, redaction) and the real
  remaining work.

---

## Quick reference

| You want to… | Command |
|---|---|
| Set up a repo once | `lore init` |
| See the dashboard | `lore` |
| Ask why something is the way it is | `lore query <words>` |
| Prove the pipeline offline | `lore compile --fixture` |
| Triage low-confidence records | `lore review` |
| Everything's health check | `lore doctor` |
| One-command demo | `npm run demo` |

The `.lore/` folder: `raw/` (local evidence, git-ignored) · `wiki/` (committed ADRs) ·
`drafts/` (awaiting review) · `meta/` (bookkeeping).

## What to look for during the demo

1. **The capture growing live** — `.lore/raw/session.jsonl` fills with the agent's reasoning as it
   works (this is the "black box" opened).
2. **The decision writing itself** — the run ends, and a moment later an ADR appears with the
   context, the decision, and the alternatives that were rejected. *Nobody typed `lore compile`.*
3. **The human commit** — `git commit`, and `post-commit` documents it. No AI.
4. **Lore's own wiki** — `cat .lore/wiki/index.md`: 11 decisions about building Lore, written by Lore.

---

## Honest status

Everything in the demo path is verified end-to-end (36 tests, type-check clean, live autonomy proof).
The plugin/MCP packages are covered by integration runs rather than a dedicated unit suite.
Scaling for a 2-year, hundreds-of-contributors repo is designed and partly built; the remaining
roadmap (partition retention, scheduled rollups, per-author id namespacing) is documented in
`docs/scaling.md` rather than hand-waved.

**Team DietCode** — concept and pitch in `concept/`.
