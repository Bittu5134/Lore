# Lore — Demo

## The 60-second version

```bash
npm run demo
```

One command. It narrates itself, needs no typing, and works **offline** (a captured
session fixture is used, so no model key is required). Pass `--live` to use a real
Cline session if `cline auth` is set up.

**The three beats the judges see:**

1. `lore init` — one command sets everything up
2. *an agent (or a human) does real work* — you don't type anything else
3. `lore query dotenv` — the answer to "why did we do it this way?"

That's the whole product. Everything below is for the presenter.

---

## What `npm run demo` does (in order)

| Beat | What happens | What to say |
|---|---|---|
| 0 | Fresh playground in `/tmp/lore-demo` | "A brand new repo, nothing set up." |
| 1 | `lore init` | "One command: knowledge store, git hooks, agent rule." |
| 2 | An agent edits code (or a captured session is seeded offline) | "Cline is working. Lore is recording its reasoning live." |
| 3 | **The session ends — the decision writes itself** | "I didn't type anything. Lore compiled the evidence on its own." |
| 4 | `lore query` prints the ADR | "Context. Decision. Rejected alternatives. A diff can never tell you this." |
| 5 | A human commits by hand | "No AI in this commit. The git hook documented it anyway." |
| 6 | Lore's own repo wiki | "It documented building itself." |

---

## If you only have 30 seconds (offline)

```bash
npm run setup && npm run demo
```

No model call, no auth. The pipeline runs on a captured-session fixture.

---

## Manual walkthrough (if the live demo breaks)

### Judge quickstart: prove it with NO model call

```bash
cd <LORE>   # this repository
export L="npx --yes tsx $PWD/packages/cli/src/index.ts"

rm -rf /tmp/lore-demo && mkdir -p /tmp/lore-demo && cd /tmp/lore-demo && git init -q
mkdir -p .lore/raw && cp <LORE>/packages/core/fixtures/session.sample.jsonl .lore/raw/session.jsonl
$L compile --fixture
cat .lore/wiki/ADR-*.md
```

**Say:** "Evidence in, decision record out, no model call. That's the pipeline."

### Live agent capture (needs `cline auth`)

```bash
rm -rf /tmp/lore-demo && mkdir -p /tmp/lore-demo && cd /tmp/lore-demo && git init -q
$L init
printf 'export const DEFAULT_CONFIG = { port: 3000 };\n' > config.ts
cline -p "make the config loader accept an APP_CONFIG environment override" --cwd /tmp/lore-demo
```

While it runs: `watch -n1 "wc -l /tmp/lore-demo/.lore/raw/session.jsonl"` in another terminal.
When it finishes, the ADR appears on its own — no `compile` command needed.

**Say:** "The session ended and the decision record wrote itself. Zero human intervention."

### Human commits (no AI)

```bash
cd /tmp/lore-demo
printf 'export const DEFAULT_CONFIG = { port: 3000, retries: 3 };\n' > config.ts
git add -A && git -c user.email=dev@x.com -c user.name=Dev commit -m "feat: add retry count"
ls .lore/wiki .lore/drafts
```

**Say:** "The post-commit hook fired `lore sync` on its own. Low-confidence goes to `drafts/` — that's the review gate."

### Merge + share

```bash
cd /tmp/lore-demo
git checkout -q -b feature && echo x > f.ts && git add -A && git -c user.email=d@x.com -c user.name=D commit -q -m "feat: f" 2>/dev/null
git checkout -q master && echo y > g.ts && git add -A && git -c user.email=d@x.com -c user.name=D commit -q -m "feat: g" 2>/dev/null
git merge feature 2>/dev/null || true
$L reconcile
$L share --out /tmp/lore-bundle.json
```

**Say:** "Two branches extended the wiki. Lore reconciled it, keeping both sides." 

### Dogfood

```bash
cat <LORE>/.lore/wiki/index.md
```

**Say:** "Lore's own repository wiki was written by Lore while we built Lore."

---

## Notes for the presenter

- **If the plugin was edited:** `cline plugin install --force` reuses its cached
  directory and does NOT overwrite. Either `cline plugin uninstall lore && cline
  plugin install ./packages/plugin`, or copy `packages/plugin/src/index.ts` over the
  installed copy. `grep -c spawnDetachedCompile <installed>/package/src/index.ts`
  tells you if the auto-compile build is installed.
- **Watch the edit journey:** `lore watch` in one terminal, edit files in another.
- **Old repositories:** `lore backfill --full` documents existing history.
- **VS Code:** the plugin registers the Lore MCP server, so `search_lore` works
  in the extension too (where hooks/plugins are unavailable).
- **Ask it:** `lore query dotenv`
