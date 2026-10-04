/**
 * `lore watch` - capture the human editing journey between commits.
 *
 * Diffs show the destination; a watcher shows the road: files touched, tried,
 * and reverted. Batches are debounced and filtered, then recorded as `fs_batch`
 * events that the compiler can reason over.
 */
import { watch } from "node:fs";
import { createStore, type LoreEvent } from "@lore/core";

const DEBOUNCE_MS = 2500;

export async function run(_args: string[]): Promise<void> {
  const root = process.cwd();
  const store = createStore(root);

  // Ignore config globs ("node_modules/**" -> "node_modules") plus our own store.
  const ignorePrefixes = store
    .readConfig()
    .ignore.map((glob) => glob.replace(/\/\*\*$/, "").replace(/\/$/, ""));

  const shouldIgnore = (rel: string): boolean =>
    rel.startsWith(".git/") ||
    rel.startsWith(".lore/") ||
    ignorePrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`));

  const touched = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    if (touched.size === 0) return;
    const files = [...touched].sort();
    touched.clear();
    const event: LoreEvent = {
      ts: new Date().toISOString(),
      source: "fs-session",
      kind: "fs_batch",
      payload: { files, note: "editing session" },
    };
    store.appendEvents([event]);
    process.stdout.write(
      `lore: captured ${files.length} edit(s): ${files.slice(0, 3).join(", ")}` +
        `${files.length > 3 ? " …" : ""}\n`,
    );
  };

  const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const rel = String(filename).replace(/\\/g, "/");
    if (shouldIgnore(rel)) return;
    touched.add(rel);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  process.stdout.write(
    `lore: watching ${root}\n  (Ctrl-C to stop; run \`lore compile\` when the session ends)\n`,
  );

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      if (timer) clearTimeout(timer);
      flush();
      watcher.close();
      process.stdout.write("lore: watcher stopped\n");
      resolve();
    });
  });
}
