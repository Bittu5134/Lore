/**
 * ADR markdown (de)serialisation. Dependency-free frontmatter handling so the
 * store never needs a YAML library.
 */
import type { Adr, AdrFrontmatter, AdrStatus } from "./types.ts";

export function padId(n: number): string {
  return `ADR-${String(n).padStart(4, "0")}`;
}

export function numericId(id: string): number {
  const m = /ADR-(\d+)/.exec(id);
  return m ? Number.parseInt(m[1] ?? "0", 10) : 0;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

export function formatAdrFilename(adr: Adr): string {
  return `${adr.frontmatter.id}-${slugify(adr.frontmatter.title)}.md`;
}

const STATUSES: ReadonlySet<string> = new Set(["accepted", "draft", "superseded"]);

function renderList(key: string, values: string[]): string[] {
  const out = [`${key}:`];
  for (const v of values) out.push(`  - ${v}`);
  return out;
}

export function renderAdr(adr: Adr): string {
  const f = adr.frontmatter;
  const lines = [
    "---",
    `id: ${f.id}`,
    `title: ${f.title}`,
    `status: ${f.status}`,
    `date: ${f.date}`,
    `confidence: ${f.confidence}`,
    ...renderList("sources", f.sources),
    ...renderList("tags", f.tags),
    "---",
    "",
    adr.body.trim(),
    "",
  ];
  return lines.join("\n");
}

export function parseAdr(markdown: string): Adr {
  const text = markdown.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) throw new Error("ADR is missing YAML frontmatter");

  const raw = match[1] ?? "";
  const body = text.slice(match[0].length).replace(/^\n+/, "");

  const scalars = new Map<string, string>();
  const lists = new Map<string, string[]>();
  let listKey: string | null = null;

  for (const line of raw.split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      lists.get(listKey)?.push(item[1]?.trim() ?? "");
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1] ?? "";
    const value = kv[2] ?? "";
    if (value === "") {
      listKey = key;
      if (!lists.has(key)) lists.set(key, []);
    } else {
      listKey = null;
      scalars.set(key, value.trim());
    }
  }

  const id = scalars.get("id") ?? "ADR-0000";
  const statusRaw = scalars.get("status") ?? "draft";
  const confidence = Number.parseFloat(scalars.get("confidence") ?? "0");

  const frontmatter: AdrFrontmatter = {
    id,
    title: scalars.get("title") ?? "Untitled",
    status: (STATUSES.has(statusRaw) ? statusRaw : "draft") as AdrStatus,
    date: scalars.get("date") ?? new Date().toISOString().slice(0, 10),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    sources: lists.get("sources") ?? [],
    tags: lists.get("tags") ?? [],
  };

  return { frontmatter, body };
}
