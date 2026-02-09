require('dotenv').config();
const express = require('express');
const path = require('path');
const { compile } = require('./lib/llm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/compile', async (req, res) => {
  try {
    const {
      campaignTitle,
      campaignTheme,
      primaryPersona,
      useCase,
      releaseContext,
      notes,
      referenceDocs,
    } = req.body;

    const parts = [
      `Campaign Title: ${campaignTitle || 'TBD'}`,
      `Campaign Theme: ${campaignTheme || 'TBD'}`,
      `Primary Persona: ${primaryPersona || 'TBD'}`,
      `Use Case or Feature: ${useCase || 'TBD'}`,
      `Release Context: ${releaseContext || 'TBD'}`,
      `Notes / Constraints: ${notes || 'None'}`,
    ];

    if (referenceDocs) {
      parts.push(`\nReference Documents:\n${referenceDocs}`);
    }

    const userMessage = parts.join('\n');
    const result = await compile(userMessage);

    res.json({ result });
  } catch (err) {
    console.error('Compile error:', err);
    res.status(500).json({ error: err.message || 'Compilation failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Marketing Compiler running on http://localhost:${PORT}`);
});
