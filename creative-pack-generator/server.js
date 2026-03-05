'use strict';

require('dotenv').config();
const express = require('express');
const { generateCreativePack } = require('./index');

const PORT        = Number(process.env.CREATIVE_PACK_PORT ?? 3010);
const VALID_BRANDS = ['LLIF', 'BestLife'];

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/',       (_req, res) => res.json({ ok: true, agent: 'creative-pack-generator', version: '1.0.0' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/compile', async (req, res) => {
  const {
    brandKey,
    campaignSlug,
    campaignTitle,
    keyMessage,
    cta,
    sourceMarkdownPath,
    campaignMonth,
    force    = false,
    provider,
  } = req.body ?? {};

  if (!brandKey || !VALID_BRANDS.includes(brandKey)) {
    return res.status(400).json({ error: `brandKey must be one of: ${VALID_BRANDS.join(', ')}` });
  }
  if (!campaignSlug && !campaignTitle) {
    return res.status(400).json({ error: 'campaignSlug or campaignTitle is required' });
  }

  try {
    const result = await generateCreativePack({
      brandKey,
      campaignSlug,
      campaignTitle,
      keyMessage,
      cta,
      sourceMarkdownPath,
      campaignMonth,
      force: Boolean(force),
      provider,
    });

    const markdown = buildMarkdown(result);
    res.json({ result: markdown, ...result });
  } catch (err) {
    console.error('[creative-pack-generator] Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

function buildMarkdown({ brandKey, campaignSlug, generated, skipped, warnings }) {
  const lines = [
    `# Creative Pack Generator — ${brandKey} / ${campaignSlug}`,
    '',
    `**Generated:** ${generated.length} file${generated.length !== 1 ? 's' : ''}`,
    `**Skipped:**   ${skipped.length} file${skipped.length !== 1 ? 's' : ''} (already exist; pass \`force: true\` to overwrite)`,
  ];
  if (warnings.length) {
    lines.push('', '## Warnings');
    warnings.forEach((w) => lines.push(`- ${w}`));
  }
  if (generated.length) {
    lines.push('', '## Generated Files');
    generated.forEach((f) => lines.push(`- \`${f}\``));
  }
  if (skipped.length) {
    lines.push('', '## Skipped');
    skipped.forEach((f) => lines.push(`- \`${f}\``));
  }
  return lines.join('\n');
}

app.listen(PORT, () => {
  console.log(`[creative-pack-generator] Listening on port ${PORT}`);
});
