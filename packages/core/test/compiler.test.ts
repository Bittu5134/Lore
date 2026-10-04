import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createClineCompiler, parseDecisionJson } from "../src/compiler.ts";
import { parseEventsJsonl } from "../src/events.ts";
import { DEFAULT_CONFIG, type AdrFrontmatter } from "../src/types.ts";

const fixture = fileURLToPath(new URL("../fixtures/session.sample.jsonl", import.meta.url));
const events = parseEventsJsonl(readFileSync(fixture, "utf8"));

const decision = {
  title: "Extend the JSON config loader instead of adding dotenv",
  context: "The config loader needed environment overrides and already read a JSON config file.",
  decision: "Extend the existing JSON loader with process.env.APP_CONFIG overrides.",
  alternatives: ["dotenv - adds a dependency and a second source of truth"],
  consequences: "No new dependency; malformed JSON now fails fast at startup.",
  confidence: 0.9,
  tags: ["config"],
  sources: ["demo-session-1"],
};

function fakeInfer(confidence = 0.9): { fn: (prompt: string) => string; prompt: () => string } {
  let seen = "";
  return {
    fn: (prompt: string) => {
      seen = prompt;
      return "```json\n" + JSON.stringify({ ...decision, confidence }) + "\n```";
    },
    prompt: () => seen,
  };
}

test("compiles captured events into an ADR routed to the wiki", async () => {
  const fake = fakeInfer(0.9);
  const compiler = createClineCompiler(DEFAULT_CONFIG, { infer: fake.fn });
  const result = await compiler.compile({ events, repoRoot: "/tmp/lore-test" });

  assert.equal(result.route, "wiki");
  assert.equal(result.adr.frontmatter.id, "ADR-0001");
  assert.equal(result.adr.frontmatter.status, "accepted");
  assert.match(result.adr.body, /## Alternatives considered/);
  assert.match(result.adr.body, /dotenv/);
  assert.match(fake.prompt(), /EVENTS CAPTURED:/);
});

test("low confidence routes to drafts", async () => {
  const compiler = createClineCompiler(DEFAULT_CONFIG, { infer: fakeInfer(0.2).fn });
  const result = await compiler.compile({ events, repoRoot: "/tmp/lore-test" });
  assert.equal(result.route, "drafts");
  assert.equal(result.adr.frontmatter.status, "draft");
});

test("allocates the next id from existing ADRs", async () => {
  const existing: AdrFrontmatter[] = [
    { id: "ADR-0007", title: "x", status: "accepted", date: "2026-01-01", confidence: 1, sources: [], tags: [] },
  ];
  const compiler = createClineCompiler(DEFAULT_CONFIG, { infer: fakeInfer().fn });
  const result = await compiler.compile({ events, repoRoot: "/tmp/lore-test", existing });
  assert.equal(result.adr.frontmatter.id, "ADR-0008");
});

test("an empty event list is rejected", async () => {
  const compiler = createClineCompiler(DEFAULT_CONFIG, { infer: fakeInfer().fn });
  await assert.rejects(() => compiler.compile({ events: [], repoRoot: "/tmp/lore-test" }));
});

test("parseDecisionJson tolerates fences and surrounding prose", () => {
  const raw = parseDecisionJson('Here you go:\n```json\n{"title":"T"}\n```\nThanks');
  assert.equal(raw.title, "T");
});

test("parseDecisionJson repairs literal newlines inside strings", () => {
  const raw = parseDecisionJson('{"title":"T","context":"line one\nline two","decision":"d"}');
  assert.equal(raw.context, "line one\nline two");
});

test("parseDecisionJson ignores content after the JSON object", () => {
  const raw = parseDecisionJson('{"title":"First","context":"c","decision":"d"}\n\nNote {"extra":1}');
  assert.equal(raw.title, "First");
});

test("parseDecisionJson prefers the final answer over earlier candidates", () => {
  const scratch = '{"title":"scratch note","context":"x","decision":"y"}';
  const real = '{"title":"Real Title","context":"ctx","decision":"dec"}';
  const raw = parseDecisionJson(`[thinking] step: ${scratch}\n[thinking] more\n${real}`);
  assert.equal(raw.title, "Real Title");
  assert.equal(raw.decision, "dec");
});
