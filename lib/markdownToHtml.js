/**
 * Markdown-to-HTML converter for web_page artifacts.
 *
 * If content looks like it's already HTML (contains tags), passes it through.
 * Otherwise converts markdown patterns to clean HTML.
 *
 * Uses the `marked` library for reliable conversion.
 */

const { marked } = require("marked");

// Configure marked for clean output (no GFM tables, no smartypants)
marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Returns true if the string appears to already be HTML.
 * Checks for common opening tags.
 */
function looksLikeHtml(str) {
  if (!str) return false;
  const trimmed = str.trim();
  // Starts with a tag, or contains block-level HTML tags
  return /^<[a-z]|<(h[1-6]|p|div|section|ul|ol|li|table|article|header|footer|main|nav)\b/i.test(trimmed);
}

/**
 * Returns true if the string contains markdown patterns.
 */
function looksLikeMarkdown(str) {
  if (!str) return false;
  // Check for common markdown patterns: headings, bold, bullets, links
  return /^#{1,6}\s|^\*\s|^-\s|^\d+\.\s|\*\*[^*]+\*\*|__[^_]+__|^\>|!\[|\[[^\]]+\]\(/m.test(str);
}

/**
 * Convert content to HTML if needed.
 *
 * @param {string} content - Raw content (markdown or HTML)
 * @returns {{ html: string, converted: boolean }} - The HTML and whether conversion happened
 */
function ensureHtml(content) {
  if (!content) return { html: "", converted: false };

  if (looksLikeHtml(content)) {
    return { html: content, converted: false };
  }

  if (looksLikeMarkdown(content)) {
    const html = marked.parse(content).trim();
    return { html, converted: true };
  }

  // Plain text — wrap in paragraph tags
  const html = content
    .split(/\n\n+/)
    .map((p) => `<p>${p.trim()}</p>`)
    .join("\n");
  return { html, converted: true };
}

module.exports = { ensureHtml, looksLikeHtml, looksLikeMarkdown };
