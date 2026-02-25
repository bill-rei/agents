require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const multer = require('multer');
const cheerio = require('cheerio');
const parseDoc = require('../lib/parse-doc');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.SITE_AUDITOR_PORT || 3002;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Crawl a single page and return structured metadata + content.
 */
async function crawlPage(url) {
  let status = 'success';
  let html;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MarketingSiteAuditor/1.1' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });

    if (res.redirected) status = 'redirect';
    if (!res.ok) {
      return { url, title: '', metaDescription: '', status: `error-${res.status}`, wordCount: 0, content: '' };
    }

    // Check for login-gated pages
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return { url, title: '', metaDescription: '', status: 'non-html', wordCount: 0, content: '' };
    }

    html = await res.text();
  } catch (err) {
    return { url, title: '', metaDescription: '', status: `error-${err.message}`, wordCount: 0, content: '' };
  }

  const $ = cheerio.load(html);

  // Detect login-gated pages
  const hasLoginForm = $('input[type="password"]').length > 0;
  if (hasLoginForm) {
    return { url, title: $('title').text().trim(), metaDescription: '', status: 'gated', wordCount: 0, content: '' };
  }

  // Remove non-content elements
  $('script, style, noscript, iframe, svg, nav, footer').remove();

  const extracted = [];

  const title = $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';

  extracted.push(`[Page Title] ${title}`);
  if (metaDesc) extracted.push(`[Meta Description] ${metaDesc}`);
  if (ogTitle) extracted.push(`[OG Title] ${ogTitle}`);
  if (ogDesc) extracted.push(`[OG Description] ${ogDesc}`);
  extracted.push('');

  // Walk headings and body content in document order
  $('h1, h2, h3, h4, p, li, blockquote, figcaption').each(function () {
    const tag = $(this).prop('tagName').toLowerCase();
    const text = $(this).text().replace(/\s+/g, ' ').trim();
    if (!text) return;

    if (tag.startsWith('h')) {
      extracted.push(`[${tag.toUpperCase()}] ${text}`);
    } else if (tag === 'li') {
      extracted.push(`  - ${text}`);
    } else if (tag === 'blockquote') {
      extracted.push(`  > ${text}`);
    } else {
      extracted.push(text);
    }
  });

  // Extract CTAs (buttons and prominent links)
  const ctas = [];
  $('a[class*="cta"], a[class*="btn"], a[class*="button"], button').each(function () {
    const text = $(this).text().replace(/\s+/g, ' ').trim();
    const href = $(this).attr('href') || '';
    if (text && text.length < 100) {
      ctas.push(`"${text}"${href ? ' -> ' + href : ''}`);
    }
  });

  if (ctas.length) {
    extracted.push('');
    extracted.push('[CTAs / Buttons]');
    ctas.forEach((c) => extracted.push(`  - ${c}`));
  }

  const content = extracted.join('\n');
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return { url, title, metaDescription: metaDesc, status, wordCount, content };
}

/**
 * Extract navigation links from a page to auto-discover site structure.
 * Returns absolute URLs on the same domain, up to maxLinks.
 */
async function extractNavLinks(baseUrl, maxLinks = 30) {
  try {
    const res = await fetch(baseUrl, {
      headers: { 'User-Agent': 'MarketingSiteAuditor/1.1' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const origin = new URL(baseUrl).origin;
    const seen = new Set();
    const links = [];

    // Extract from nav elements, then fall back to header links
    const navLinks = $('nav a[href], header a[href]');
    navLinks.each(function () {
      if (links.length >= maxLinks) return false;
      const href = $(this).attr('href');
      if (!href) return;

      try {
        const resolved = new URL(href, baseUrl).href.split('#')[0].split('?')[0];
        if (resolved.startsWith(origin) && !seen.has(resolved)) {
          seen.add(resolved);
          links.push(resolved);
        }
      } catch { /* skip malformed URLs */ }
    });

    return links;
  } catch {
    return [];
  }
}

/**
 * Crawl multiple pages sequentially. Returns array of crawl results.
 */
async function crawlSite(urls, excludeUrls = []) {
  const excludeSet = new Set(excludeUrls.map((u) => u.trim()).filter(Boolean));
  const results = [];

  for (const url of urls) {
    if (excludeSet.has(url)) {
      results.push({ url, title: '', metaDescription: '', status: 'excluded', wordCount: 0, content: '' });
      continue;
    }
    const result = await crawlPage(url);
    results.push(result);
  }

  return results;
}

/**
 * Truncate page content based on number of pages being audited.
 */
function truncateContent(content, pageCount) {
  const maxChars = pageCount > 1 ? 15000 : 30000;
  if (content.length > maxChars) {
    return content.slice(0, maxChars) + `\n\n[Content truncated at ${maxChars} characters]`;
  }
  return content;
}

app.post('/api/compile', upload.array('files'), async (req, res) => {
  try {
    const {
      // Explicit mode override (from portal toggle)
      auditMode,
      // Full site audit fields
      domain,
      pageUrls,
      audienceSegments,
      excludeUrls,
      // Single page fields (backward compat)
      pageUrl,
      pageContent,
      // Reference documents
      founderLanguageGuide,
      productManual,
      messagingFramework,
      brandSeparationRules,
      strategicGuardrails,
      referenceDocs,
      // General
      notes,
    } = req.body;

    // Parse uploaded files into reference text
    let refFileText = '';
    if (req.files && req.files.length) {
      const parsed = [];
      for (const f of req.files) {
        try {
          const text = await parseDoc(f.buffer, f.mimetype, f.originalname);
          parsed.push(`\n\n[File: ${f.originalname}]\n${text}`);
        } catch (err) {
          console.error('Failed to parse file', f.originalname, err);
          parsed.push(`\n\n[File: ${f.originalname}] (unreadable: ${err.message})`);
        }
      }
      refFileText = parsed.join('\n');
    }

    // Determine audit mode: full site vs single page.
    // pageUrls may be newline- or comma-separated (portal sends comma, direct UI sends newline).
    const urlList = pageUrls
      ? pageUrls.split(/[\n,]/).map((u) => u.trim()).filter(Boolean)
      : [];
    const excludeList = excludeUrls
      ? excludeUrls.split(/[\n,]/).map((u) => u.trim()).filter(Boolean)
      : [];

    // auditMode === 'single_page' takes priority; otherwise infer from fields present.
    const isFullSite = auditMode === 'single_page'
      ? false
      : !!(domain || urlList.length);
    const parts = [];

    if (isFullSite) {
      // Full site audit mode
      let pagesToCrawl = urlList;

      // Auto-discover if domain provided but no page URLs
      if (domain && !urlList.length) {
        const domainUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        console.log(`Auto-discovering pages from ${domainUrl}...`);
        pagesToCrawl = await extractNavLinks(domainUrl);
        // Always include the homepage
        if (!pagesToCrawl.includes(domainUrl)) {
          pagesToCrawl.unshift(domainUrl);
        }
        parts.push(`[Auto-discovered ${pagesToCrawl.length} pages from ${domainUrl}]`);
      }

      if (!pagesToCrawl.length) {
        parts.push('[No pages to crawl. Please provide page URLs or a domain.]');
      } else {
        console.log(`Crawling ${pagesToCrawl.length} pages...`);
        const crawlResults = await crawlSite(pagesToCrawl, excludeList);

        // Build site manifest summary
        parts.push('SITE MANIFEST');
        parts.push(`Domain: ${domain || new URL(pagesToCrawl[0]).origin}`);
        if (audienceSegments) parts.push(`Audience Segments: ${audienceSegments}`);
        parts.push(`Pages in scope: ${crawlResults.length}`);
        parts.push('');

        // Build crawl results
        parts.push('CRAWL RESULTS');
        parts.push('=============');

        const succeeded = [];
        const failed = [];
        const gated = [];
        const excluded = [];

        for (const r of crawlResults) {
          if (r.status === 'excluded') {
            excluded.push(r.url);
          } else if (r.status === 'gated') {
            gated.push(r.url);
          } else if (r.status.startsWith('error')) {
            failed.push(`${r.url} (${r.status})`);
          } else {
            succeeded.push(r);
          }
        }

        if (failed.length) parts.push(`\nFailed pages: ${failed.join(', ')}`);
        if (gated.length) parts.push(`\nGated pages (not publicly auditable): ${gated.join(', ')}`);
        if (excluded.length) parts.push(`\nExcluded pages: ${excluded.join(', ')}`);

        parts.push(`\nSuccessfully crawled: ${succeeded.length} pages\n`);

        for (const r of succeeded) {
          parts.push(`--- PAGE: ${r.url} ---`);
          parts.push(`Title: ${r.title}`);
          parts.push(`Word count: ~${r.wordCount}`);
          parts.push(`Status: ${r.status}`);
          parts.push('');
          parts.push(truncateContent(r.content, succeeded.length));
          parts.push('\n');
        }
      }
    } else {
      // Single page audit mode (backward compatible)
      if (pageUrl && !pageContent) {
        try {
          console.log(`Crawling ${pageUrl}...`);
          const result = await crawlPage(pageUrl);
          parts.push(`Page URL: ${result.url}`);
          parts.push(`Title: ${result.title}`);
          parts.push(`Word count: ~${result.wordCount}`);
          parts.push(`Status: ${result.status}`);
          parts.push('');
          parts.push(`Crawled Page Content:\n${truncateContent(result.content, 1)}`);
        } catch (err) {
          console.error('Crawl failed:', err.message);
          parts.push(`[Crawl failed for ${pageUrl}: ${err.message}. Paste page content manually.]`);
        }
      } else if (pageUrl) {
        parts.push(`Page URL: ${pageUrl}`);
      }

      if (pageContent) {
        parts.push(`Page Content to Audit:\n${pageContent}`);
      }

      if (audienceSegments) {
        parts.push(`\nAudience Segments: ${audienceSegments}`);
      }
    }

    if (!pageContent && !pageUrl && !domain && !urlList.length && !refFileText) {
      parts.push('[No page content provided. Please paste page content, provide a URL, or enter a domain to audit.]');
    }

    // Reference documents — structured by type
    const refDocs = [];
    if (founderLanguageGuide) refDocs.push(`[Founder Language Guide]\n${founderLanguageGuide}`);
    if (productManual) refDocs.push(`[Product Manual / Product Reality Anchor]\n${productManual}`);
    if (messagingFramework) refDocs.push(`[Messaging Framework]\n${messagingFramework}`);
    if (brandSeparationRules) refDocs.push(`[Brand / Entity Separation Rules]\n${brandSeparationRules}`);
    if (strategicGuardrails) refDocs.push(`[Strategic Guardrails]\n${strategicGuardrails}`);
    if (referenceDocs) refDocs.push(`[Additional Reference Documents]\n${referenceDocs}`);
    if (refFileText) refDocs.push(`[Uploaded Reference Files]${refFileText}`);

    if (refDocs.length) {
      parts.push('\nREFERENCE DOCUMENTS');
      parts.push('===================');
      parts.push(refDocs.join('\n\n'));
    } else {
      parts.push('\n[No reference documents provided. Dimensions 2A, 2B, and 2D will be SKIPPED.]');
    }

    if (notes) {
      parts.push(`\nOperator Notes:\n${notes}`);
    }

    const userMessage = parts.join('\n');
    const result = await compile(userMessage, SYSTEM_PROMPT, { provider: req.query.provider });

    res.json({ result });
  } catch (err) {
    console.error('Site Auditor error:', err);
    res.status(500).json({ error: err.message || 'Audit failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Marketing Site Auditor v1.1 running on http://localhost:${PORT}`);
});
