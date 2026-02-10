require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const multer = require('multer');
const parseDoc = require('../lib/parse-doc');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.COMPILER_PORT || 3000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/compile', upload.array('files'), async (req, res) => {
  try {
    const {
      campaignTitle,
      campaignTheme,
      primaryPersona,
      useCase,
      releaseContext,
      notes,
      outputMode,
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

    const mode = outputMode === 'web_page_copy' ? 'web_page_copy' : 'narrative_structure';

    const parts = [
      `Campaign Title: ${campaignTitle || 'TBD'}`,
      `Campaign Theme: ${campaignTheme || 'TBD'}`,
      `Primary Persona: ${primaryPersona || 'TBD'}`,
      `Use Case or Feature: ${useCase || 'TBD'}`,
      `Release Context: ${releaseContext || 'TBD'}`,
      `Notes / Constraints: ${notes || 'None'}`,
      `Output Mode: ${mode}`,
    ];

    if (mode === 'web_page_copy') {
      parts.push('deliverable: web_copy=true');
    }

    if (refText) {
      parts.push(`\nReference Documents:\n${refText}`);
    }

    const userMessage = parts.join('\n');
    const result = await compile(userMessage, SYSTEM_PROMPT);

    res.json({ result });
  } catch (err) {
    console.error('Compile error:', err);
    res.status(500).json({ error: err.message || 'Compilation failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Marketing Compiler running on http://localhost:${PORT}`);
});
