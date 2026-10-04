import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { formatAdrFilename, numericId, padId, parseAdr, renderAdr, slugify } from "../src/adr.ts";

const samplePath = fileURLToPath(new URL("../fixtures/adr.sample.md", import.meta.url));

test("padId + numericId round-trip", () => {
  assert.equal(padId(1), "ADR-0001");
  assert.equal(padId(42), "ADR-0042");
  assert.equal(numericId("ADR-0042"), 42);
  assert.equal(numericId("nonsense"), 0);
});

test("slugify produces file-safe slugs", () => {
  assert.equal(slugify("Extend the JSON config loader instead of adding dotenv"), "extend-the-json-config-loader-instead-of-adding-dotenv");
  assert.equal(slugify("!!!"), "untitled");
});

test("parses the fixture ADR frontmatter", () => {
  const adr = parseAdr(readFileSync(samplePath, "utf8"));
  assert.equal(adr.frontmatter.id, "ADR-0001");
  assert.equal(adr.frontmatter.status, "accepted");
  assert.equal(adr.frontmatter.confidence, 0.82);
  assert.deepEqual(adr.frontmatter.sources, ["demo-session-1"]);
  assert.deepEqual(adr.frontmatter.tags, ["config", "dependencies"]);
  assert.match(adr.body, /## Alternatives considered/);
});

test("render -> parse round-trips every frontmatter field", () => {
  const original = parseAdr(readFileSync(samplePath, "utf8"));
  const round = parseAdr(renderAdr(original));
  assert.deepEqual(round.frontmatter, original.frontmatter);
  assert.equal(round.body.trim(), original.body.trim());
});

test("formatAdrFilename combines id and slug", () => {
  const adr = parseAdr(readFileSync(samplePath, "utf8"));
  assert.equal(formatAdrFilename(adr), "ADR-0001-extend-the-json-config-loader-instead-of-adding-dotenv.md");
});
