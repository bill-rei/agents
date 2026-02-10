require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const multer = require('multer');
const parseDoc = require('../lib/parse-doc');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.SITE_AUDITOR_PORT || 3002;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

    const parts = [];

    if (pageUrl) {
      parts.push(`Page URL: ${pageUrl}`);
    }

    if (pageContent) {
      parts.push(`Page Content to Audit:\n${pageContent}`);
    }

    if (!pageContent && !pageUrl && !refText) {
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
