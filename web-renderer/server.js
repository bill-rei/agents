require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.WEB_RENDERER_PORT || 3007;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/compile', async (req, res) => {
  try {
    const { rawCopy, pageName, constraints, renderProfile } = req.body;

    if (!rawCopy || !rawCopy.trim()) {
      return res.status(400).json({ error: 'Missing required input: rawCopy' });
    }

    // Build the user message
    const parts = [`Page: ${pageName || 'Unnamed'}`, '', `Raw Copy:\n${rawCopy}`];

    if (constraints && constraints.length) {
      const list = Array.isArray(constraints) ? constraints : [constraints];
      parts.push(`\nRendering Constraints:\n${list.join('\n')}`);
    }

    if (renderProfile) {
      parts.push(`\nRender Profile: ${renderProfile}`);
    }

    const userMessage = parts.join('\n');
    let html = await compile(userMessage, SYSTEM_PROMPT);

    // Strip code fences if the LLM wrapped the output
    html = html.trim();
    if (html.startsWith('```html')) html = html.slice(7);
    else if (html.startsWith('```')) html = html.slice(3);
    if (html.endsWith('```')) html = html.slice(0, -3);
    html = html.trim();

    // Extract title from first <h1>
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = h1Match
      ? h1Match[1].replace(/<[^>]+>/g, '').trim()
      : (pageName || 'Untitled');

    res.json({
      artifact_type: 'web_page',
      content_format: 'html',
      content: { title, html },
    });
  } catch (err) {
    console.error('WebRenderer error:', err);
    res.status(500).json({ error: err.message || 'Rendering failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Web Renderer running on http://localhost:${PORT}`);
});
