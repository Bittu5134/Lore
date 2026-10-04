/**
 * `lore audit` - scan the Lore store for secrets that should never have been captured.
 *
 * Exits non-zero when something is found, so it can gate CI.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { LORE_PATHS, createStore } from "@lore/core";

const PATTERNS: Array<[string, RegExp]> = [
  // (?<![A-Za-z0-9]) so words like "risk-management-…" are not mistaken for keys.
  ["OpenAI-style key", /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g],
  ["GitHub token", /(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{20,}/g],
  ["AWS access key", /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["assigned secret", /(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"',]{8,}/gi],
];

export async function run(_args: string[]): Promise<void> {
  const root = process.cwd();
  const store = createStore(root);
  const config = store.readConfig();

  const files: string[] = [];
  for (const rel of [LORE_PATHS.raw, LORE_PATHS.wiki, LORE_PATHS.drafts]) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".jsonl") || file.endsWith(".md")) files.push(join(dir, file));
    }
  }

  const secretIgnores = config.ignore.filter((g) => /env|pem|key|credential|secret|id_rsa/i.test(g));
  process.stdout.write(`lore audit — ${files.length} file(s) scanned\n`);
  process.stdout.write(`  ignoring: ${secretIgnores.join(", ") || "(no secret patterns configured)"}\n`);

  let findings = 0;
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const [label, pattern] of PATTERNS) {
      const matches = text.match(pattern);
      if (!matches || matches.length === 0) continue;
      findings += matches.length;
      process.stdout.write(`  ! ${relative(root, file)} — ${matches.length} × ${label}\n`);
    }
  }

  if (findings === 0) {
    process.stdout.write("lore: clean — no secrets found in raw evidence or the wiki\n");
    return;
  }
  process.stdout.write(
    `lore: ${findings} potential secret(s) found\n` +
      `  fix: delete the offending raw events (raw/ is local and git-ignored), then \`lore index\`\n`,
  );
  process.exitCode = 1;
}
