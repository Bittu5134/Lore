/**
 * `lore compile` - distil captured events into an ADR.
 *
 * Reads events since the cursor (or all with --last/--all), runs the Cline
 * inference, and writes the result to wiki/ (or drafts/ when low confidence).
 */
import { createClineCompiler, createStore } from "@lore/core";

export async function run(args: string[]): Promise<void> {
  const root = process.cwd();
  const store = createStore(root);
  const config = store.readConfig();

  const force = args.includes("--last") || args.includes("--all");
  const cursor = store.readState().lastEventTs;
  const events = store.readEvents(force || !cursor ? undefined : { since: cursor });

  if (events.length === 0) {
    process.stdout.write("lore: nothing new to compile\n");
    return;
  }

  const existing = store.allAdrFrontmatter();
  const compiler = createClineCompiler(config);
  process.stdout.write(
    `lore: compiling ${events.length} event(s) via ${config.inference.provider}` +
      `${config.inference.model ? ` (${config.inference.model})` : ""}...\n`,
  );

  const result = await compiler.compile({
    events,
    repoRoot: root,
    existing,
    reason: "lore compile",
  });
  const written = store.writeAdr(result);

  const last = events[events.length - 1];
  if (last) store.writeState({ ...store.readState(), lastEventTs: last.ts });

  process.stdout.write(
    `lore: ${written.id} (confidence ${result.confidence.toFixed(2)}) -> ${written.path}` +
      `${result.route === "drafts" ? "  [draft - needs review]" : ""}\n`,
  );
}
