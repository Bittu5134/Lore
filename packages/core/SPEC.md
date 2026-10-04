# SPEC — Lane 1: Core engine (`@lore/core`)

## Goal
Implement the store and the ADR compiler behind the frozen contracts in `src/types.ts`.
You own the *only* copy of the compile logic — every capture lane feeds `compile()`.

## Deliverables (files you own)
- `src/store.ts` — `createStore(repoRoot)` returning an object with:
  - `init()` — create `.lore/{raw,wiki,drafts,meta,hooks}`, `config.json` (from `DEFAULT_CONFIG`),
    `meta/state.json` (from `DEFAULT_STATE`), `wiki/index.md`
  - `readConfig()` / `writeConfig(cfg)`, `readState()` / `writeState(state)`
  - `appendEvents(events: LoreEvent[])` → JSONL in `raw/`
  - `readEvents(opts?: { since?: string; file?: string })` → `LoreEvent[]`
  - `listAdrs()` → `AdrFrontmatter[]`, `readAdr(id)` → `Adr | null`, `writeAdr(result)`
  - `searchAdrs(query, limit)` → `SearchLoreOutput["results"]` (term frequency + title boost over `wiki/*.md`)
  - `enqueue(item)` / `drainQueue()`
- `src/adr.ts` — `parseAdr(markdown): Adr`, `renderAdr(adr): string` (YAML frontmatter, exact round-trip
  of `fixtures/adr.sample.md`), `formatAdrFilename(adr)`
- `src/events.ts` — `parseEventLine(line): LoreEvent`, `serializeEvent(e): string`
- `src/compiler.ts` — `createClineCompiler(config): Compiler`
  - Build a prompt from the events that DEMANDS a single JSON object:
    `{ title, context, decision, alternatives: string[], consequences, confidence: number, tags: string[], sources: string[] }`
  - Shell out: `execFileSync("cline", ["-p", prompt, "--cwd", repoRoot, "--thinking", config.inference.thinking ?? "medium", ...(model ? ["-m", model] : [])])`
  - Parse the JSON (tolerate ```json fences), map into `Adr`, set `route` from
    `config.autonomy === "auto" && confidence >= config.confidenceThreshold ? "wiki" : "drafts"`
- `src/index.ts` — export the above (keep `export * from "./types.ts"`)
- `test/store.test.ts`, `test/adr.test.ts` — see acceptance

## Contract inputs
`fixtures/session.sample.jsonl` (10 events incl. reasoning, 2 tool pairs, run_finished, commit),
`fixtures/adr.sample.md`, `fixtures/adr-template.md`.

## Acceptance (must pass)
1. `readEvents` on `fixtures/session.sample.jsonl` → 10 `LoreEvent`s; the two `reasoning` payloads keep
   their full `text`.
2. `parseAdr(renderAdr(parseAdr(readFileSync("fixtures/adr.sample.md"))))` round-trips every
   frontmatter field (`id,title,status,date,confidence,sources,tags`).
3. Compiler test with an **injected fake inference function** (no network): given the fixture events,
   returns an ADR whose body contains `## Alternatives considered` and at least one rejected alternative;
   `route === "wiki"` at confidence 0.9, `route === "drafts"` at confidence 0.3.
4. `npx tsx --test packages/core/test/*.test.ts` passes.

## Boundaries
- Edit only `packages/core/**`. Do not change `src/types.ts` (if you must, bump `CONTRACTS_VERSION`
  and note it).
- All inference goes through the injected/stubbed function in tests — never call `cline` in tests.

## Hint
Keep `parseAdr`/`renderAdr` dependency-free (no yaml lib): a tiny frontmatter serializer is enough and
avoids install risk.
