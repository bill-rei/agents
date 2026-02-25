/**
 * Unescape JSON-style escape sequences in a string.
 *
 * When users paste agent output that contains HTML stored inside a JSON
 * string value (e.g. the literal text \"<h1>...</h1>\\n<p>...</p>\"), the
 * backslash-n sequences survive as two characters rather than a real newline.
 * This utility converts them back to the actual characters they represent.
 *
 * Only runs the replacements when the string actually contains escape
 * sequences, so clean HTML passes through unchanged.
 */
export function normalizeEscapes(s: string): string {
  // Fast path — avoid allocations when no escape sequences are present.
  if (
    !s.includes("\\n") &&
    !s.includes("\\t") &&
    !s.includes('\\"') &&
    !s.includes("\\'")
  ) {
    return s;
  }

  return (
    s
      // \r\n must come before \n so we collapse CRLF to a single newline
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
  );
}
