require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const multer = require('multer');
const parseDoc = require('../lib/parse-doc');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.STRATEGIST_PORT || 3003;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/compile', upload.array('files'), async (req, res) => {
  try {
    const {
      gtmPriorities,
      releaseContext,
      campaignBacklog,
      auditSummary,
      constraints,
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

    const parts = [];

    if (gtmPriorities) {
      parts.push(`GTM Priorities / Themes:\n${gtmPriorities}`);
    }

    if (releaseContext) {
      parts.push(`Product Release Context:\n${releaseContext}`);
    }

    if (campaignBacklog) {
      parts.push(`Campaign Backlog / Cadence:\n${campaignBacklog}`);
    }

    if (auditSummary) {
      parts.push(`Audit / Performance Summary:\n${auditSummary}`);
    }

    if (constraints) {
      parts.push(`Constraints (timing, audience, no-go topics):\n${constraints}`);
    }

    if (refText) {
      parts.push(`Reference Documents:\n${refText}`);
    }

    if (parts.length === 0) {
      parts.push('[No inputs provided. Please provide GTM priorities, release context, or other strategic inputs.]');
    }

    const userMessage = parts.join('\n\n');
    const result = await compile(userMessage, SYSTEM_PROMPT);

    res.json({ result });
  } catch (err) {
    console.error('Strategist error:', err);
    res.status(500).json({ error: err.message || 'Strategy generation failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Marketing Strategist running on http://localhost:${PORT}`);
});
