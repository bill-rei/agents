require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const multer = require('multer');
const parseDoc = require('../lib/parse-doc');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.EDITOR_PORT || 3001;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/compile', upload.array('files'), async (req, res) => {
  try {
    const {
      campaignAssets,
      auditFindings,
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

    const parts = [
      `Campaign Assets to Edit:\n${campaignAssets || '[No assets provided]'}`,
    ];

    if (auditFindings) {
      parts.push(`\nSite Audit Findings:\n${auditFindings}`);
    }

    if (notes) {
      parts.push(`\nEditor Notes / Constraints:\n${notes}`);
    }

    if (refText) {
      parts.push(`\nReference Documents (SSOT / Product Manual / GTM):\n${refText}`);
    }

    const userMessage = parts.join('\n');
    const result = await compile(userMessage, SYSTEM_PROMPT);

    res.json({ result });
  } catch (err) {
    console.error('Editor error:', err);
    res.status(500).json({ error: err.message || 'Editing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Marketing Editor running on http://localhost:${PORT}`);
});
