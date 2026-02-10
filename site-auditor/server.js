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

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function crawlPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MarketingSiteAuditor/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, noscript, iframe, svg, nav, footer').remove();

  const extracted = [];

  // Page title and meta
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

  // Truncate to avoid exceeding LLM context
  const content = extracted.join('\n');
  const maxChars = 30000;
  if (content.length > maxChars) {
    return content.slice(0, maxChars) + '\n\n[Content truncated at ' + maxChars + ' characters]';
  }
  return content;
}

app.post('/api/compile', upload.array('files'), async (req, res) => {
  try {
    const {
      pageContent,
      pageUrl,
      gtmContext,
      notes,
      referenceDocs,
    } = req.body;

    let refText = referenceDocs || '';

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
      refText = (refText ? refText + '\n' : '') + parsed.join('\n');
    }

    // Crawl live page if URL provided and no manual content pasted
    let crawledContent = '';
    if (pageUrl && !pageContent) {
      try {
        crawledContent = await crawlPage(pageUrl);
      } catch (err) {
        console.error('Crawl failed:', err.message);
        crawledContent = `[Crawl failed for ${pageUrl}: ${err.message}. Paste page content manually.]`;
      }
    }

    const parts = [];

    if (pageUrl) {
      parts.push(`Page URL: ${pageUrl}`);
    }

    if (pageContent) {
      parts.push(`Page Content to Audit:\n${pageContent}`);
    } else if (crawledContent) {
      parts.push(`Crawled Page Content:\n${crawledContent}`);
    }

    if (!pageContent && !crawledContent && !pageUrl && !refText) {
      parts.push('[No page content provided. Please paste page content, provide a URL, or upload files to audit.]');
    }

    if (gtmContext) {
      parts.push(`\nGTM Context / Positioning:\n${gtmContext}`);
    }

    if (notes) {
      parts.push(`\nHuman Notes:\n${notes}`);
    }

    if (refText) {
      parts.push(`\nReference Documents (Product Manual, GTM, etc.):\n${refText}`);
    }

    const userMessage = parts.join('\n');
    const result = await compile(userMessage, SYSTEM_PROMPT);

    res.json({ result });
  } catch (err) {
    console.error('Site Auditor error:', err);
    res.status(500).json({ error: err.message || 'Audit failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Marketing Site Auditor running on http://localhost:${PORT}`);
});
