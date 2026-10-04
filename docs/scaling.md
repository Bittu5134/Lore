# Scaling Lore: what is implemented, what remains

Written when the question came up: *"will this work for 100s of contributors across 2 years?"*
Short answer: the concept scales; the storage/summarisation layer needed work. Here is the
state of each item.

## Implemented

| Concern | What changed |
|---|---|
| **Raw events in git history** | `.lore/raw/` is **git-ignored**. Only the curated `wiki/` + `drafts/` (and hooks/config) are committed. Multi-GB of append-only logs never enter history. |
| **Read-all on every compile** | Raw events are **partitioned by month** (`raw/YYYY-MM-<source>.jsonl`). `readEvents({since})` skips whole months older than the cursor instead of parsing the full log. |
| **Index rewritten on every write** | `writeAdr()` no longer regenerates `wiki/index.md` (that was O(n) per ADR ⇒ O(n²) per backfill). The index is rebuilt once per command run, or on demand with `lore index`. |
| **Linear search** | `lore index` builds a **SQLite FTS5** index (`.lore/meta/search.db`) via built-in `node:sqlite`; `searchAdrsAsync()` uses it when present and falls back to the linear scan when the runtime lacks FTS5. |
| **Flat, ever-growing wiki** | `lore rollup [--month YYYY-MM] [--write]` synthesises a **theme ADR** over a period; ADRs carry a `## Supersedes` section and `superseded` status, so history stays navigable as a chain rather than duplicated. |
| **Every commit costs a model call** | The compiler prompt returns **`decisions: []`** for non-architectural changes (formatting, typos, dependency bumps), so noise is skipped before any ADR is written; `--fixture` proves pipelines offline. |
| **Secrets leaking into the wiki** | Secret path patterns are ignored by default; capture applies **redaction**; `lore audit` scans raw + wiki and exits non-zero (CI-gateable). |
| **Cross-repo knowledge** | `lore link add <path>` + `lore query --all` search related repositories together. |

## Still to do (roadmap)

1. **Prune/compact raw partitions** older than N months (retention policy), or move them to
   object storage; the wiki keeps the durable knowledge either way.
2. **Rollups on a schedule** — a cron/CI job that runs `lore rollup --month <last> --write`.
3. **Id namespacing at high write concurrency** — ids are monotonic per store with collision
   resolution at write time; per-author prefixes (`ADR-2026-10-<author>-01`) would remove the
   remaining race entirely.
4. **Incremental FTS updates** — today the index is rebuilt wholesale; FTS5 supports incremental
   inserts once the volume justifies it.
5. **Distributed sessions** — for many agents writing simultaneously, the raw layer wants a
   real append service (SQLite WAL or a queue) instead of one JSONL file per month per source.
