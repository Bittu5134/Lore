# SPEC — Lane 2: Agent capture (`@lore/plugin`)

## Goal
Capture the live Cline reasoning stream + tool trail into `.lore/raw/` as it happens.
This is the demo centrepiece: "open the black box".

## Two capture paths (build in this order)
### Path A — SDK wrapper (build first, it always works)
- `src/wrapper.ts` — `runWithCapture(prompt: string, opts?): Promise<void>`
  - Use `@cline/sdk`: `new Agent({ providerId, modelId, tools, ... })` (add `@cline/sdk` to
    `packages/plugin/package.json` dependencies and run `npm install`)
  - `agent.subscribe(event => …)` and append a `LoreEvent` per runtime event:
    - `assistant-reasoning-delta` → `kind:"reasoning"`, `payload.text = event.accumulatedText`
    - `assistant-text-delta` → `kind:"assistant_text"`
    - `tool-started` → `kind:"tool_call"` (`payload.tool = event.toolCall.toolName`, `parameters`)
    - `tool-finished` → `kind:"tool_result"` (`payload.result`, `success`)
    - `run-finished` → `kind:"run_finished"` (`payload.status`, `payload.outputText`)
  - Writes to `.lore/raw/session-<sessionId>.jsonl`
  - `npx tsx packages/plugin/src/wrapper.ts "task" --cwd /path/to/repo`

### Path B — installable plugin (the pitch's "native hook")
- `src/index.ts` — `export default` an `AgentPlugin`:
  ```ts
  { name: "lore", manifest: { capabilities: ["hooks"] },
    hooks: { onEvent(event) { /* same mapping as wrapper, append-only */ } } }
  ```
  - `import type { AgentPlugin } from "@cline/sdk"` — type-only
  - **Runtime imports: `node:*` only.** `import type` from `@lore/core` is fine (erased).
  - Wrap every handler in try/catch — hooks must fail-open and never slow the loop.
- `hooks.json` — CLI runtime-hook config registering our capture command:
  `{"PreToolUse":[{"command":"lore hook tool_call"}], "PostToolUse":[{"command":"lore hook tool_result"}], "UserPromptSubmit":[{"command":"lore hook prompt_submit"}], "SessionStart":[…], "Stop":[…]}` — check the exact schema the CLI expects (it reads `hooks/hooks.json`; see `--hooks-dir`) and adjust; document what you verified in a comment.
- `commands/hook.ts` already exists in the CLI (Lane 0 wrote it) — refine only if the real payload
  envelope differs from what you observe.

## Acceptance
1. Path A: run a real task → `.lore/raw/session-*.jsonl` contains ≥1 `reasoning` event **whose text is
   non-empty** (if empty, retry with `--thinking medium`) and both halves of ≥1 tool pair.
2. `cline plugin install ./packages/plugin` succeeds and a subsequent `cline -p "…"` run produces the
   same JSONL (Path B).
3. If (2) fails after ~30 min, ship Path A only and note it in `packages/plugin/README.md`.

## Boundaries
- Edit only `packages/plugin/**` (+ adding a root `package.json` dependency if needed).

## Verification commands
```
npx tsx packages/plugin/src/wrapper.ts "add a comment to PLAN.md" --cwd .
tail -5 .lore/raw/session-*.jsonl
```
