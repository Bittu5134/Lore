/**
 * `lore compile` - distil captured events into an ADR.
 *
 * Reads events since the cursor (or all with --last/--all), runs the Cline
 * inference, and writes the result to wiki/ (or drafts/ when low confidence).
 */
import { createClineCompiler, createStore } from "@lore/core";

/**
 * `--fixture` proves the whole pipeline with NO model call: for judges without
 * Cline auth, for CI, and for demos in an offline room.
 */
export const FIXTURE_DECISION = {
  decisions: [
    {
      title: "Extend the existing JSON config loader instead of adding dotenv",
      context:
        "The config loader needed environment overrides while the repo already read a single JSON config file.",
      decision: "Extend the existing loader with an APP_CONFIG env override, keeping one source of truth.",
      alternatives: ["dotenv - adds a dependency and a second file to keep in sync"],
      consequences: "No new dependency; malformed JSON fails fast at startup.",
      confidence: 0.82,
      tags: ["config", "fixture"],
      supersedes: null,
    },
  ],
};

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
  const fixture = args.includes("--fixture");
  const compiler = fixture
    ? createClineCompiler(config, { infer: () => JSON.stringify(FIXTURE_DECISION) })
    : createClineCompiler(config);

  process.stdout.write(
    `lore: compiling ${events.length} event(s) via ` +
      (fixture ? "FIXTURE MODE (no model call)" : config.inference.provider) +
      `${!fixture && config.inference.model ? ` (${config.inference.model})` : ""}...\n`,
  );

  const results = await compiler.compile({
    events,
    repoRoot: root,
    existing,
    reason: "lore compile",
  });

  if (results.length === 0) {
    process.stdout.write("lore: no architectural decision in these events (nothing recorded)\n");
  }
  for (const result of results) {
    const written = store.writeAdr(result);
    process.stdout.write(
      `lore: ${written.id} (confidence ${result.confidence.toFixed(2)}) -> ${written.path}` +
        `${result.route === "drafts" ? "  [draft - needs review]" : ""}\n`,
    );
  }

  const last = events[events.length - 1];
  if (last) store.writeState({ ...store.readState(), lastEventTs: last.ts });
}
