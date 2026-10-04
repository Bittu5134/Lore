import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createStore, type Adr, type CompileResult, type LoreEvent } from "../src/index.ts";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "lore-store-"));
}

const event: LoreEvent = {
  ts: "2026-10-04T10:00:00.000Z",
  source: "cline-session",
  kind: "reasoning",
  sessionId: "s1",
  payload: { text: "we chose the existing loader over dotenv" },
};

const adr: Adr = {
  frontmatter: {
    id: "ADR-0001",
    title: "Extend the JSON config loader instead of adding dotenv",
    status: "accepted",
    date: "2026-10-04",
    confidence: 0.9,
    sources: ["s1"],
    tags: ["config"],
  },
  body: "# ADR-0001\n\n## Decision\n\nUse APP_CONFIG.\n\n## Alternatives considered\n\n- dotenv was rejected\n",
};

const result: CompileResult = { adr, confidence: 0.9, route: "wiki" };

test("init creates the store and is idempotent", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();
    store.init();
    assert.ok(existsSync(join(root, ".lore/config.json")));
    assert.ok(existsSync(join(root, ".lore/meta/state.json")));
    assert.ok(existsSync(join(root, ".lore/wiki/index.md")));
    assert.equal(store.readConfig().autonomy, "auto");
    assert.equal(store.readState().nextAdrId, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appendEvents + readEvents round-trip through the raw layer", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();
    store.appendEvents([event]);
    const events = store.readEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.sessionId, "s1");
    // partitions are named YYYY-MM-<source>.jsonl
    assert.ok(existsSync(join(root, ".lore/raw/2026-10-session.jsonl")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("raw events are partitioned by month and a cursor skips old months", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();

    const oldEvent: LoreEvent = {
      ts: "2025-01-05T00:00:00.000Z",
      source: "git-commit",
      kind: "commit",
      commit: "deadbeef",
      payload: { message: "an old commit" },
    };
    const newEvent: LoreEvent = { ...event, ts: "2026-10-05T00:00:00.000Z" };
    store.appendEvents([oldEvent, newEvent]);

    const rawDir = join(root, ".lore/raw");
    assert.ok(existsSync(join(rawDir, "2025-01-commits.jsonl")));
    assert.ok(existsSync(join(rawDir, "2026-10-session.jsonl")));

    assert.equal(store.readEvents().length, 2);
    assert.equal(store.readEvents({ since: "2026-01-01T00:00:00.000Z" }).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeAdr lands in wiki and is findable (index is built on demand)", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();
    const written = store.writeAdr(result);
    assert.equal(written.id, "ADR-0001");
    assert.ok(existsSync(join(root, written.path)));
    assert.equal(store.readAdr("ADR-0001")?.frontmatter.title, adr.frontmatter.title);
    assert.equal(store.readState().nextAdrId, 2);
    // The index is deliberately NOT rewritten on every ADR write (docs/scaling.md):
    // regenerateIndex() (or `lore index`) does it once per run.
    store.regenerateIndex();
    assert.match(readFileSync(join(root, ".lore/wiki/index.md"), "utf8"), /ADR-0001/);
    assert.equal(store.searchAdrs("dotenv")[0]?.adrId, "ADR-0001");
    assert.equal(store.allAdrFrontmatter().length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("promoteAdr moves a draft into the wiki as an accepted ADR", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();
    const drafted: CompileResult = {
      route: "drafts",
      confidence: 0.3,
      adr: { ...adr, frontmatter: { ...adr.frontmatter, status: "draft" } },
    };
    store.writeAdr(drafted);
    assert.equal(store.listAdrs("drafts").length, 1);

    const promoted = store.promoteAdr("ADR-0001");
    assert.equal(promoted.ok, true);
    assert.equal(store.listAdrs("drafts").length, 0);
    assert.equal(store.listAdrs("wiki").length, 1);
    assert.equal(store.readAdr("ADR-0001")?.frontmatter.status, "accepted");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("supersedeAdr marks an ADR superseded and cites its replacement", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();
    store.writeAdr(result);
    assert.equal(store.supersedeAdr("ADR-0001", "ADR-0009"), true);

    const superseded = store.readAdr("ADR-0001");
    assert.equal(superseded?.frontmatter.status, "superseded");
    assert.match(superseded?.body ?? "", /Superseded by ADR-0009/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("drafts route writes to drafts/, not wiki/", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();
    const drafted: CompileResult = {
      route: "drafts",
      confidence: 0.2,
      adr: { ...adr, frontmatter: { ...adr.frontmatter, status: "draft" } },
    };
    const written = store.writeAdr(drafted);
    assert.match(written.path, /drafts/);
    assert.equal(store.listAdrs("wiki").length, 0);
    assert.equal(store.listAdrs("drafts").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeAdr resolves id collisions from concurrent writers", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.init();
    const first = store.writeAdr(result);
    const second = store.writeAdr(result); // same ADR-0001 again
    assert.equal(first.id, "ADR-0001");
    assert.equal(second.id, "ADR-0002");
    assert.equal(store.listAdrs("wiki").length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeState works without init (capture-first workflows)", () => {
  const root = tempRoot();
  try {
    const store = createStore(root);
    store.writeState({ nextAdrId: 5 });
    assert.ok(existsSync(join(root, ".lore/meta/state.json")));
    assert.equal(store.readState().nextAdrId, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
