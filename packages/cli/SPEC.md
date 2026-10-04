# SPEC — Lanes 4 & 5: CLI capture, merge & sharing (`@lore/cli`)

Command dispatch is dynamic: create `src/commands/<name>.ts` exporting
`run(args: string[]): Promise<void>`. You own **only your own command files** — never edit `index.ts`.
Done already (Lane 0): `init`, `hook`, `doctor`.

## Lane 4 — Human capture
### `src/commands/sync.ts` — `lore sync [--auto]`
1. Read `meta/state.json` cursor (`lastCommit`).
2. `git log --reverse --pretty=format:%H <cursor>..HEAD` (or all history if no cursor).
3. For each commit: `git show --stat --patch <sha>` → build a `commit` `LoreEvent`
   (`source:"git-commit"`, `payload:{message, files, diff}`) and `appendEvents(...)`.
4. Hand the events to `createClineCompiler(config).compile(...)` and write the result
   (`route === "wiki" ? wiki/ : drafts/`), then advance the cursor.
5. `--auto` = silent mode used by the post-commit hook; always exit 0.

### `src/commands/backfill.ts` — `lore backfill [--full]`
Same pipeline over the whole history, batched (e.g. 10 commits per compile) so an old repo gets
documented. Respects/ignores the cursor with `--full`.

### `src/commands/watch.ts` — `lore watch`
- Node 22 recursive `fs.watch(root, { recursive: true })`, debounce ~2s, filter via `config.ignore`.
- Accumulate touched paths in memory; on flush write ONE `fs_batch` event
  (`payload:{files, note?}`) recording the session journey; compile when idle > 30s or on Ctrl-C.
- Print a live line per flush so the demo shows the watcher working.

### Git hook scripts
`init.ts` already writes `.lore/hooks/post-commit` → `sync --auto` and `.lore/hooks/post-merge` →
`reconcile`. Verify they run (`git commit` → new ADR appears) and fix the hook content in `init.ts`
if needed.

## Lane 5 — Merge reconciler & Mechanism
### `src/commands/reconcile.ts` — `lore reconcile`
After a merge, both branches may have edited `.lore/wiki/`. Re-read all ADRs + raw events, recompile
the affected decisions, and write a merged wiki that **retains both sides** (append rather than
overwrite; if two ADRs share an id, keep both bodies under a `## Merged` section and relink).
Commit the result with `git add .lore && git commit -m "lore: reconcile wiki"`.

### `src/commands/share.ts` — `lore share [--out <file>]`
Export a portable bundle: `{ version, exportedAt, adrs: Adr[], rawEventCount }` → default
`.lore/lore-bundle.json`.

### `src/commands/pull.ts` — `lore pull <file>`
Import a bundle: merge ADRs by id (skip duplicates, note conflicts), write them into `wiki/`.

## Acceptance
1. `lore sync --auto` after a real commit creates exactly one ADR and advances the cursor
   (second run is a no-op).
2. `lore backfill` on a repo with history produces ≥1 ADR.
3. `lore watch` + one edit produces an `fs_batch` event in `raw/`.
4. Two branches editing `.lore/wiki/` merge → `lore reconcile` produces a wiki containing BOTH edits
   and a `lore: reconcile wiki` commit.
5. `lore share` then `lore pull` on a fresh clone restores the ADRs.

## Boundaries
- Edit only `packages/cli/src/commands/{sync,backfill,watch,reconcile,share,pull}.ts` and
  `.lore/hooks/*` content inside `init.ts` if a fix is required.
- Read/write the store strictly through `@lore/core`.
