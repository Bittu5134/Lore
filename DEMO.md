# Lore — Hackathon Demo Script

Everything below is verified working. Total run time ≈ 4–6 min (inference calls dominate).

Setup once:

```bash
cd /home/bittu/Developer/temp/Lore
export LORE="npx --yes tsx $PWD/packages/cli/src/index.ts"
```

---

## Act 1 — "Open the black box" (the centrepiece)

```bash
rm -rf /tmp/demo && mkdir -p /tmp/demo && cd /tmp/demo && git init -q
npx --yes tsx /home/bittu/Developer/temp/Lore/packages/cli/src/index.ts init
printf 'export const DEFAULT_CONFIG = { port: 3000 };\n' > config.ts
```

Ask a real agent to change the code **in front of the judges**:

```bash
cline -p "make the config loader accept an APP_CONFIG environment override; keep the JSON file as the single source of truth" --cwd /tmp/demo
```

While it runs, point at the growing capture file — Lore is recording the agent's
**inner monologue**, not just the result:

```bash
watch -n1 'wc -l /tmp/demo/.lore/raw/session.jsonl'
```

Now distil the session into a decision record:

```bash
npx --yes tsx /home/bittu/Developer/temp/Lore/packages/cli/src/index.ts compile
cat /tmp/demo/.lore/wiki/ADR-*.md
```

**Say:** "The ADR contains the context, the decision, and the alternatives the agent
considered and rejected — the reasoning that a commit diff can never show."

## Act 2 — Continuity (a new session reads the lore)

```bash
cd /tmp/demo && cline -p "add input validation to the config loader" --cwd /tmp/demo
```

The `.clinerules/lore.md` rule makes the agent read `.lore/wiki/` first, so it respects
the recorded decision instead of re-litigating it. Ask it: *"what did we decide about
dotenv, and why?"* — it answers from the ADR.

## Act 3 — Works without AI (human commits)

```bash
cd /tmp/demo
printf 'export const DEFAULT_CONFIG = { port: 3000, retries: 3 };\n' > config.ts
git add -A && git -c user.email=dev@x.com -c user.name=Dev commit -m "feat: add retry count to default config"
```

The `post-commit` hook (installed into `.lore/hooks`, activated via `core.hooksPath`)
fires `lore sync` automatically — a new ADR appears with **no AI in the loop**:

```bash
ls /tmp/demo/.lore/wiki/ ; git -C /tmp/demo log --oneline -1
```

Low-confidence inferences land in `.lore/drafts/` instead (confidence < 0.60) — show both.

## Act 4 — Merge & Mechanism

```bash
cd /tmp/demo
# simulate two branches extending the wiki
git checkout -q -b feature && echo x > f.ts && git add -A && git -c user.email=d@x.com -c user.name=D commit -q -m "feat: f" 2>/dev/null
git checkout -q master && echo y > g.ts && git add -A && git -c user.email=d@x.com -c user.name=D commit -q -m "feat: g" 2>/dev/null
git merge feature 2>/dev/null || true
npx --yes tsx /home/bittu/Developer/temp/Lore/packages/cli/src/index.ts reconcile
npx --yes tsx /home/bittu/Developer/temp/Lore/packages/cli/src/index.ts share --out /tmp/lore-bundle.json
```

**Say:** "When two maintainers (or two agents) both extend the wiki, Lore reconciles it —
keeping both sides — and can hand the knowledge to another repo as a portable bundle."

## Act 5 — Dogfood

```bash
cat /home/bittu/Developer/temp/Lore/.lore/wiki/index.md
```

Lore's own repository wiki contains ADRs written **by Lore, about building Lore**
(e.g. "Layer Lore as one core plus thin adapters" and "Shell out to the Cline CLI as
the inference backend"). That is the product proving itself.

---

## Optional extras

- **Live edit journey (watcher):** `lore watch` in one terminal, edit files in another →
  `fs_batch` events capture the road, not just the destination.
- **Old repo backfill:** `lore backfill --full` documents an existing repository's history.
- **MCP / VS Code:** call `search_lore` from any MCP client (works in the VS Code Cline
  extension, where plugins/hooks are not yet available) — see `packages/mcp/README.md`.
- **Query:** `lore query dotenv`
