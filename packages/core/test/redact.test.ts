import assert from "node:assert/strict";
import { test } from "node:test";
import { redactText, redactValue } from "../src/redact.ts";

test("redacts key-shaped secrets", () => {
  assert.equal(redactText("OPENAI=sk-proj-abcdefghijklmnop1234"), "OPENAI=[redacted-openai-key]");
  assert.equal(redactText("token: ghp_abcdefghijklmnopqrstuvwx"), "token: [redacted-github-token]");
  assert.equal(redactText("AWS=AKIAIOSFODNN7EXAMPLE"), "AWS=[redacted-aws-key]");
  assert.equal(redactText("password=hunter2xyz"), "password=[redacted]");
});

test("does not mangle ordinary words that merely contain a key prefix", () => {
  assert.equal(redactText("risk-management-approach stays intact"), "risk-management-approach stays intact");
});

test("redacts nested values", () => {
  const out = redactValue({
    env: { API_KEY: "sk-abcdefghijklmnopqrst" },
    note: "nothing sensitive here",
  }) as { env: Record<string, unknown>; note: string };
  assert.equal(out.env.API_KEY, "[redacted-openai-key]");
  assert.equal(out.note, "nothing sensitive here");
});
