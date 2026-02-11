require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const multer = require('multer');
const parseDoc = require('../lib/parse-doc');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.WMA_PORT || 3006;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/compile', upload.array('files'), async (req, res) => {
  try {
    const {
      pageName,
      siteAuditInput,
      strategistTheme,
      strategistPersona,
      strategistScope,
      strategistExclusions,
      referenceDocs,
    } = req.body;

    // Validate required inputs
    const missing = [];
    if (!siteAuditInput) missing.push('Site Audit Output');
    if (!strategistTheme) missing.push('Strategist Theme');
    if (!strategistPersona) missing.push('Strategist Persona');
    if (!strategistScope) missing.push('Strategist Scope');

    if (missing.length) {
      return res.status(400).json({
        error: `Missing required inputs: ${missing.join(', ')}. This agent cannot proceed without locked strategist decisions and a site audit.`,
      });
    }

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

    const parts = [
      `Page: ${pageName || 'TBD'}`,
      '',
      'Locked Strategist Decisions:',
      `  Theme: ${strategistTheme}`,
      `  Persona: ${strategistPersona}`,
      `  Scope: ${strategistScope}`,
      `  Explicit Exclusions: ${strategistExclusions || 'None specified'}`,
      '',
      `Site Audit Output:\n${siteAuditInput}`,
    ];

    if (refText) {
      parts.push(`\nReference Documents (SSOT):\n${refText}`);
    }

    const userMessage = parts.join('\n');
    const result = await compile(userMessage, SYSTEM_PROMPT);

    res.json({ result });
  } catch (err) {
    console.error('Website Messaging Architect error:', err);
    res.status(500).json({ error: err.message || 'Messaging architecture failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Website Messaging Architect running on http://localhost:${PORT}`);
});
