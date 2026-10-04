/**
 * `lore backfill [--full]` - document an existing repository's history.
 *
 * Replays git history through the same pipeline as `sync`, in batches so an
 * old repo gets a wiki without one giant prompt.
 */
import { createClineCompiler, createStore, type LoreEvent } from "@lore/core";
import { allCommits, commitToEvent, commitsSince } from "./sync.ts";

const BATCH_SIZE = 8;

export async function run(args: string[]): Promise<void> {
  const full = args.includes("--full");
  const root = process.cwd();
  const store = createStore(root);

  const commits = full
    ? allCommits(root)
    : commitsSince(root, store.readState().lastCommit);

  if (commits.length === 0) {
    process.stdout.write("lore: nothing to backfill\n");
    return;
  }
  process.stdout.write(
    `lore: backfilling ${commits.length} commit(s) in batches of ${BATCH_SIZE}\n`,
  );

  const compiler = createClineCompiler(store.readConfig());

  for (let i = 0; i < commits.length; i += BATCH_SIZE) {
    const batch = commits.slice(i, i + BATCH_SIZE);
    const events: LoreEvent[] = batch.map((sha) => commitToEvent(root, sha));
    store.appendEvents(events);

    const results = await compiler.compile({
      events,
      repoRoot: root,
      existing: store.allAdrFrontmatter(),
      reason: `backfill ${batch[0]?.slice(0, 8)}..${batch[batch.length - 1]?.slice(0, 8)}`,
    });
    const progress = `  [${Math.min(i + BATCH_SIZE, commits.length)}/${commits.length}]`;
    if (results.length === 0) {
      process.stdout.write(`${progress} no architectural decision (skipped)\n`);
    }
    for (const result of results) {
      const written = store.writeAdr(result);
      process.stdout.write(`${progress} ${written.id} (confidence ${result.confidence.toFixed(2)})\n`);
    }

    const head = batch[batch.length - 1];
    if (head) store.writeState({ ...store.readState(), lastCommit: head });
  }

  process.stdout.write(
    `lore: backfill complete - wiki has ${store.listAdrs("wiki").length} ADR(s)\n`,
  );
}
