require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const multer = require('multer');
const parseDoc = require('../lib/parse-doc');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.OPTIMIZER_PORT || 3005;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/compile', upload.array('files'), async (req, res) => {
  try {
    const {
      campaignMeta,
      platformMetrics,
      qualitativeFeedback,
      humanNotes,
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

    if (campaignMeta) {
      parts.push(`Campaign Metadata (title, theme, persona):\n${campaignMeta}`);
    }

    if (platformMetrics) {
      parts.push(`Platform Performance Metrics:\n${platformMetrics}`);
    }

    if (qualitativeFeedback) {
      parts.push(`Qualitative Feedback (comments, replies, observations):\n${qualitativeFeedback}`);
    }

    if (humanNotes) {
      parts.push(`Human Notes:\n${humanNotes}`);
    }

    if (refText) {
      parts.push(`Reference Documents (distributed assets, campaign brief, etc.):\n${refText}`);
    }

    if (parts.length === 0) {
      parts.push('[No inputs provided. Please provide campaign metadata, metrics, or feedback to analyze.]');
    }

    const userMessage = parts.join('\n\n');
    const result = await compile(userMessage, SYSTEM_PROMPT);

    res.json({ result });
  } catch (err) {
    console.error('Optimizer error:', err);
    res.status(500).json({ error: err.message || 'Optimization analysis failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Marketing Optimizer running on http://localhost:${PORT}`);
});
