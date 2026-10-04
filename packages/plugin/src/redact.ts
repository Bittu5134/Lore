import type { RuntimeEventLike } from "./types.ts";

export const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // (?<![A-Za-z0-9]) avoids mangling ordinary words such as "risk-management-…".
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g, "[redacted-openai-key]"],
  [/(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{20,}/g, "[redacted-github-token]"],
  [/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g, "[redacted-aws-key]"],
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g, "[redacted-private-key]"],
  [/((?:\bkey\b|\btoken\b|\bsecret\b|\bpassword\b|\bpasswd\b|\bapi[_-]?key\b)\s*[:=]\s*)(["']?)(?!\[redacted)([^\s"',]{6,})/gi, "$1$2[redacted]"],
];

/** Best-effort secret masking - applied before anything is written to disk. */
export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function redactValue(node: unknown): string {
  try {
    return redact(typeof node === "string" ? node : JSON.stringify(node ?? null));
  } catch {
    return "[unserialisable]";
  }
}

/** Recursively redact every string inside an object/array (tool parameters). */
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

/** Files whose contents must never be captured verbatim. */
const SENSITIVE_PATH = /(^|[\\/])\.env|\.pem$|\.key$|id_rsa|id_ed25519|credentials|secret/i;

export function touchesSensitiveFile(event: RuntimeEventLike): boolean {
  const input = event.toolCall?.input;
  if (!input) return false;
  try {
    return SENSITIVE_PATH.test(JSON.stringify(input));
  } catch {
    return false;
  }
}
