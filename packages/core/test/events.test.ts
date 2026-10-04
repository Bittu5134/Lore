import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseEventLine, parseEventsJsonl, renderTranscript, sortEvents } from "../src/events.ts";

const fixture = fileURLToPath(new URL("../fixtures/session.sample.jsonl", import.meta.url));

test("parses every line of the session fixture", () => {
  const events = parseEventsJsonl(readFileSync(fixture, "utf8"));
  assert.equal(events.length, 10);
});

test("keeps the full reasoning text", () => {
  const events = parseEventsJsonl(readFileSync(fixture, "utf8"));
  const reasoning = events.filter((e) => e.kind === "reasoning");
  assert.equal(reasoning.length, 2);
  assert.match(String(reasoning[0]?.payload.text), /env overrides/);
  assert.match(String(reasoning[1]?.payload.text), /Rejected dotenv/);
});

test("rejects blank and malformed lines", () => {
  assert.equal(parseEventLine(""), null);
  assert.equal(parseEventLine("not json"), null);
  assert.equal(parseEventLine('{"ts":"2026-01-01T00:00:00Z"}'), null);
});

test("transcript surfaces reasoning, tool calls and the commit", () => {
  const events = parseEventsJsonl(readFileSync(fixture, "utf8"));
  const transcript = renderTranscript(events);
  assert.match(transcript, /\[reasoning\]/);
  assert.match(transcript, /\[tool:call\] read_files/);
  assert.match(transcript, /\[commit a1b2c3d4\]/);
});

test("sortEvents orders chronologically", () => {
  const events = parseEventsJsonl(readFileSync(fixture, "utf8"));
  const sorted = sortEvents([...events].reverse());
  assert.ok(sorted.every((e, i) => i === 0 || (sorted[i - 1]?.ts ?? "") <= e.ts));
});
