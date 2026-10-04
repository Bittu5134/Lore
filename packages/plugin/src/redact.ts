/**
 * @fileoverview Standalone Secret Redaction Engine for the Cline Plugin.
 *
 * @description
 * Implements write-path secret redaction designed specifically for zero-dependency
 * operation within the Cline runtime environment. Mirrors the regex patterns of `@lore/core`
 * to mask tokens, passwords, and API keys before they reach the local telemetry log.
 * Also inspects tool invocation parameters to identify and suppress capture of
 * file operations touching `.env`, `.pem`, `.key`, or credentials.
 */

import type { RuntimeEventLike } from "./types.ts";

/**
 * Array of regular expression masks for identified secret formats.
 */
export const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // (?<![A-Za-z0-9]) avoids mangling ordinary words such as "risk-management-…".
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g, "[redacted-openai-key]"],
  [/(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{20,}/g, "[redacted-github-token]"],
  [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, "[redacted-aws-key]"],
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g, "[redacted-private-key]"],
  [/((?:\bkey\b|\btoken\b|\bsecret\b|\bpassword\b|\bpasswd\b|\bapi[_-]?key\b)\s*[:=]\s*)(["']?)(?!\[redacted)([^\s"',]{6,})/gi, "$1$2[redacted]"],
];

/**
 * Mask identifiable secrets within a string using standard placeholder tags.
 *
 * @param text Raw text containing potentially sensitive data.
 * @returns Redacted string safe for storage.
 */
export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Coerces an arbitrary value to string and sanitizes any sensitive tokens.
 *
 * @param node Value to format and redact.
 * @returns Serialized, sanitized string.
 */
export function redactValue(node: unknown): string {
  try {
    return redact(typeof node === "string" ? node : JSON.stringify(node ?? null));
  } catch {
    return "[unserialisable]";
  }
}

/**
 * Recursively redacts every string field in a nested data structure or array.
 *
 * @param node Arbitrary JSON object or array (e.g. tool call input arguments).
 * @returns Sanitized clone of the input data structure.
 */
export function redactDeep(node: unknown): unknown {
  if (typeof node === "string") return redact(node);
  if (Array.isArray(node)) return node.map((item) => redactDeep(item));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = redactDeep(value);
    }
    return out;
  }
  return node;
}

/** Regex matching sensitive file paths that must never have tool operations captured. */
const SENSITIVE_PATH = /(^|[\\/])\.env|\.pem$|\.key$|id_rsa|id_ed25519|credentials|secret/i;

/**
 * Checks whether a runtime event represents an operation on a sensitive file
 * (e.g., reading a `.env` file or private key).
 *
 * @param event Runtime event emitted by Cline.
 * @returns True if the tool invocation targets a sensitive file path.
 */
export function touchesSensitiveFile(event: RuntimeEventLike): boolean {
  const input = event.toolCall?.input;
  if (!input) return false;
  try {
    return SENSITIVE_PATH.test(JSON.stringify(input));
  } catch {
    return false;
  }
}
