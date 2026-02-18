/**
 * Sanitize structured content fields to remove inline styles, script tags,
 * and other dangerous patterns. Operates on raw strings before they reach
 * the WP API.
 */

const INLINE_STYLE_RE = /\s*style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_TAG_RE = /<\/?script[^>]*>/gi;
const EVENT_HANDLER_RE = /\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Strip inline styles, event handlers, and script tags from a string. */
export function sanitizeString(input: string): string {
  return input
    .replace(SCRIPT_TAG_RE, "")
    .replace(INLINE_STYLE_RE, "")
    .replace(EVENT_HANDLER_RE, "");
}

/** Returns true if the string contains forbidden patterns. */
export function hasForbiddenPatterns(input: string): string[] {
  const issues: string[] = [];
  if (SCRIPT_TAG_RE.test(input)) issues.push("Contains <script> tags");
  // Reset lastIndex after test with global flag
  SCRIPT_TAG_RE.lastIndex = 0;
  if (INLINE_STYLE_RE.test(input)) issues.push("Contains inline styles");
  INLINE_STYLE_RE.lastIndex = 0;
  if (EVENT_HANDLER_RE.test(input)) issues.push("Contains event handlers");
  EVENT_HANDLER_RE.lastIndex = 0;
  return issues;
}

/** Check all string fields in a DesignContract-shaped object for forbidden patterns. */
export function auditContract(artifact: Record<string, unknown>): string[] {
  const issues: string[] = [];

  function walk(obj: unknown, path: string) {
    if (typeof obj === "string") {
      const found = hasForbiddenPatterns(obj);
      for (const issue of found) {
        issues.push(`${path}: ${issue}`);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  }

  walk(artifact, "");
  return issues;
}
