/**
 * Best-effort secret masking for captured evidence (git diffs, commit bodies,
 * tool output). Applied on write so secrets never reach `.lore/raw/`.
 *
 * The capture plugin carries the same patterns inline (it must stay
 * dependency-free so it can be installed as a single file), so keep the two in
 * sync when changing this list.
 */

export const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // (?<![A-Za-z0-9]) avoids mangling ordinary words such as "risk-management-…".
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g, "[redacted-openai-key]"],
  [/(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{20,}/g, "[redacted-github-token]"],
  [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, "[redacted-aws-key]"],
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g, "[redacted-private-key]"],
  [
    /((?:\bkey\b|\btoken\b|\bsecret\b|\bpassword\b|\bpasswd\b|\bapi[_-]?key\b)\s*[:=]\s*)(["']?)(?!\[redacted)([^\s"',]{6,})/gi,
    "$1$2[redacted]",
  ],
];

export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Recursively redact every string in an object/array. */
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
