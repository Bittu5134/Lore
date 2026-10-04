/**
 * @fileoverview Redaction Engine for Sanitizing Sensitive Information & Secrets.
 *
 * @description
 * High-performance, zero-dependency data sanitation engine that prevents tokens,
 * passwords, private keys, and cloud credentials from entering the Lore telemetry logs
 * (`.lore/raw/`) or compiled ADR documentation.
 *
 * Redaction is executed on the write-path BEFORE events or git diffs hit disk.
 *
 * Note: The `@lore/plugin` package mirrors these exact regular expressions to maintain
 * standalone zero-dependency capability within the Cline plugin host environment.
 */

/**
 * Array of sensitive pattern definitions and their corresponding replacement masks.
 * Patterns use lookbehinds and word boundaries to avoid corrupting ordinary English
 * phrases (e.g., words containing 'sk-', 'key', or 'token' in non-credential contexts).
 */
export const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // OpenAI API Keys: sk-...
  // (?<![A-Za-z0-9]) prevents matching compound words like "risk-management"
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g, "[redacted-openai-key]"],

  // GitHub Personal Access Tokens: ghp_...
  [/(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{20,}/g, "[redacted-github-token]"],

  // AWS Access Key IDs: AKIA...
  [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, "[redacted-aws-key]"],

  // PEM Encrypted / Unencrypted Private Keys
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g, "[redacted-private-key]"],

  // Generic key/token/secret assignments: e.g. token="abcdef12345"
  [
    /((?:\bkey\b|\btoken\b|\bsecret\b|\bpassword\b|\bpasswd\b|\bapi[_-]?key\b)\s*[:=]\s*)(["']?)(?!\[redacted)([^\s"',]{6,})/gi,
    "$1$2[redacted]",
  ],
];

/**
 * Scans a string and replaces all identifiable secrets with safe placeholder masks.
 *
 * @example
 * redactText("export OPENAI_API_KEY=sk-abcdef1234567890123")
 * // returns "export OPENAI_API_KEY=[redacted-openai-key]"
 *
 * @param text Arbitrary raw text (diffs, log messages, code fragments).
 * @returns Sanitized text string.
 */
export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Recursively traverses any JavaScript object, array, or scalar, redacting any
 * nested string values. Preserves primitive types, nulls, and data structure shapes.
 *
 * @example
 * redactValue({ auth: { token: "ghp_01234567890123456789" }, active: true })
 * // returns { auth: { token: "[redacted-github-token]" }, active: true }
 *
 * @param node Any JSON-compatible data structure or primitive.
 * @returns Sanitized clone of the input node.
 */
export function redactValue(node: unknown): unknown {
  if (typeof node === "string") return redactText(node);
  if (Array.isArray(node)) return node.map((item) => redactValue(item));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = redactValue(value);
    }
    return out;
  }
  return node;
}
