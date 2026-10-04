# Lore — Hackathon Demo Script

Everything below is verified working. Total run time ≈ 4–6 min (model calls dominate).
Commands are path-independent: replace `<LORE>` with the path to this clone.

```bash
cd <LORE>                       # this repository
export LORE="npx --yes tsx $PWD/packages/cli/src/index.ts"
export DEMO=/tmp/lore-demo
```

Pre-flight (10 seconds):

```bash
npm run setup                   # checks Node, Cline, auth, plugin; prints what's missing
$LORE doctor                    # the same checks, each with the exact fix
```

---

## Act 0 — Judge quickstart: prove it with NO model call (30 seconds, works offline)

```bash
rm -rf $DEMO && mkdir -p $DEMO/.lore/raw && cd $DEMO && git init -q
cp <LORE>/packages/core/fixtures/session.sample.jsonl .lore/raw/session.jsonl
$LORE compile --fixture
cat .lore/wiki/ADR-*.md
```

**Say:** "That is the whole pipeline — evidence in, decision record out — with no model call, so it works
even without Cline auth. With Cline, that evidence is a real agent session."

---

## Act 1 — "Open the black box" (the centrepiece)

```bash
rm -rf $DEMO && mkdir -p $DEMO && cd $DEMO && git init -q
$LORE init
printf 'export const DEFAULT_CONFIG = { port: 3000 };\n' > config.ts
```

Ask a real agent to change the code **in front of the judges**:

```bash
cline -p "make the config loader accept an APP_CONFIG environment override; keep the JSON file as the single source of truth" --cwd $DEMO
```

While it runs, point at the growing capture file — Lore is recording the agent's
**inner monologue**, not just the result:

```bash
watch -n1 "wc -l $DEMO/.lore/raw/session.jsonl"
```

Now distil the session into a decision record:

```bash
cd $DEMO && $LORE compile
cat .lore/wiki/ADR-*.md
```

**Say:** "The ADR contains the context, the decision, and the alternatives the agent
considered and rejected — the reasoning that a commit diff can never show."

## Act 2 — Continuity (a new session reads the lore)

```bash
cd $DEMO && cline -p "add input validation to the config loader" --cwd $DEMO
```

`lore init` wrote `.clinerules/lore.md`, so the agent reads `.lore/wiki/` before editing.
Ask it: *"what did we decide about dotenv, and why?"* — it answers from the ADR.

## Act 3 — Works without AI (human commits)

```bash
cd $DEMO
printf 'export const DEFAULT_CONFIG = { port: 3000, retries: 3 };\n' > config.ts
git add -A && git -c user.email=dev@x.com -c user.name=Dev commit -m "feat: add retry count to the default config"
```

The `post-commit` hook (installed into `.lore/hooks`, activated via `core.hooksPath`) fires
`lore sync` automatically — a new ADR appears with **no AI in the loop**:

```bash
ls .lore/wiki .lore/drafts
```

Low-confidence inferences land in `.lore/drafts/` instead of `wiki/` (confidence < 0.60) —
show both; that is the review gate.

## Act 4 — Merge & Mechanism

```bash
cd $DEMO
git checkout -q -b feature && echo x > f.ts && git add -A && git -c user.email=d@x.com -c user.name=D commit -q -m "feat: f" 2>/dev/null
git checkout -q master && echo y > g.ts && git add -A && git -c user.email=d@x.com -c user.name=D commit -q -m "feat: g" 2>/dev/null
git merge feature 2>/dev/null || true
$LORE reconcile
$LORE share --out /tmp/lore-bundle.json
```

**Say:** "When two maintainers (or two agents) both extend the wiki, Lore reconciles it —
keeping both sides — and can hand the knowledge to another repo as a portable bundle."

## Act 5 — Dogfood

```bash
cat <LORE>/.lore/wiki/index.md
```

Lore's own repository wiki contains ADRs written **by Lore, about building Lore** — the
product proving itself on its own history.

---

## Optional extras

- **If you edit the capture plugin:** `cline plugin install --force` reuses the cached directory
  (`~/.cline/plugins/_installed/local/<hash>`) and does NOT overwrite the file. Either
  `cline plugin uninstall lore && cline plugin install ./packages/plugin`, or copy
  `packages/plugin/src/index.ts` over the installed copy. Verify with
  `grep -c inferenceInFlight <installed>/package/src/index.ts`.
- **Live edit journey (watcher):** `lore watch` in one terminal, edit files in another →
  `fs_batch` events capture the road, not just the destination.
- **Old repo backfill:** `lore backfill --full` documents an existing repository's history.
- **MCP / VS Code:** call `search_lore` from any MCP client (works in the VS Code Cline
  extension, where plugins/hooks are not yet available) — see `packages/mcp/README.md`.
- **Query:** `lore query dotenv`
