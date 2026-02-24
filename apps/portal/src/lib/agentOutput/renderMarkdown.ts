/**
 * Server-side Markdown → safe HTML renderer for agent output documents.
 *
 * This is used ONLY in the Run Steps inspector UI to display the rendered
 * preview of an agent's Markdown output. It is NOT the publishing-boundary
 * converter — that lives in web-renderer / publishDesignLockedPage.
 *
 * Uses `marked` with HTML sanitization:
 * - All HTML tags in the source are escaped before conversion
 *   (our validator already rejects them, but we add a second layer of safety).
 * - Output is trusted only for display inside the portal UI.
 */

import { marked } from "marked";

// Configure marked: no HTML pass-through, GFM on, no smart quotes.
const renderer = new marked.Renderer();

// Override to escape any raw HTML that somehow slips through.
// (The validator already rejected it, but belt-and-suspenders.)
renderer.html = ({ text }: { text: string }) =>
  text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

marked.use({ renderer, gfm: true, breaks: false });

/**
 * Convert an agent output Markdown document to HTML.
 * Returns a string of safe HTML suitable for dangerouslySetInnerHTML in the portal UI.
 */
export function renderMarkdown(markdown: string): string {
  // Strip YAML frontmatter before rendering — we display it separately
  const body = stripFrontmatter(markdown);
  const html = marked.parse(body);
  if (typeof html !== "string") return String(html);
  return html;
}

function stripFrontmatter(md: string): string {
  const norm = md.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return norm;
  const end = norm.indexOf("\n---\n", 4);
  if (end === -1) return norm;
  return norm.slice(end + 5);
}
