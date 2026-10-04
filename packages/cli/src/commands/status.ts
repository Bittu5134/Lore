/**
 * `lore status` - the dashboard: what Lore saw, decided, and is waiting on.
 *
 * Also runs when you type bare `lore`. This is the first thing a new user should
 * see, so it reads like a report, not a manual.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LORE_PATHS, createStore } from "@lore/core";

function ago(iso: string | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "never";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export async function run(_args: string[]): Promise<void> {
  const root = process.cwd();
  const out = process.stdout;

  // Not initialised: say the one thing to do, and nothing else.
  if (!existsSync(join(root, LORE_PATHS.config))) {
    out.write(
      [
        "",
        "  lore — this repository has no memory yet.",
        "",
        "  Set it up once:",
        "",
        "    lore init",
        "",
        "  Then just work normally. Cline sessions and git commits are captured and",
        "  distilled into decision records in .lore/wiki/ — no daily commands.",
        "",
      ].join("\n"),
    );
    return;
  }

  const store = createStore(root);
  const config = store.readConfig();
  const adrs = store.listAdrs("wiki");
  const drafts = store.listAdrs("drafts");

  let lastCapture = "";
  let rawFiles = 0;
  const rawDir = join(root, LORE_PATHS.raw);
  if (existsSync(rawDir)) {
    for (const file of readdirSync(rawDir)) {
      if (!file.endsWith(".jsonl")) continue;
      rawFiles += 1;
      try {
        const mt = statSync(join(rawDir, file)).mtime.toISOString();
        if (mt > lastCapture) lastCapture = mt;
      } catch {
        // unreadable file: ignore
      }
    }
  }

  let hooksOk = false;
  try {
    const hooksPath = execFileSync("git", ["config", "core.hooksPath"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    hooksOk =
      hooksPath === LORE_PATHS.hooks && existsSync(join(root, LORE_PATHS.hooks, "post-commit"));
  } catch {
    // not a git repo
  }

  out.write(`\n  lore — ${root}\n\n`);
  out.write(
    `  decisions   ${adrs.length} accepted` +
      (drafts.length > 0 ? `  ·  ${drafts.length} draft(s) awaiting review` : "") +
      "\n",
  );
  out.write(`  autonomy    ${config.autonomy} (confidence threshold ${config.confidenceThreshold})\n`);
  out.write(`  captured    ${rawFiles > 0 ? ago(lastCapture) : "nothing yet"} (${rawFiles} evidence file(s))\n`);
  out.write(`  hooks       ${hooksOk ? "post-commit + post-merge active" : "not installed (run: lore init)"}\n`);
  out.write("\n");

  if (drafts.length > 0) {
    out.write(`  next:  lore review        (decide what the ${drafts.length} draft(s) mean)\n`);
  } else if (adrs.length === 0) {
    out.write("  next:  work normally — or prove the pipeline offline: lore compile --fixture\n");
  } else {
    out.write("  next:  lore query <words>   ·   lore graph   ·   lore digest\n");
  }

  const latest = [...adrs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 3);
  out.write("\n  latest decisions:\n");
  for (const adr of latest) out.write(`    ${adr.id}  ${adr.title}\n`);
  if (latest.length === 0) out.write("    (none yet)\n");
  out.write("\n");
}
