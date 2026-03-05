'use strict';

require('dotenv').config();
const express = require('express');
const { compileBrandAssets } = require('./index');

const PORT = Number(process.env.BRAND_ASSET_COMPILER_PORT ?? 3009);
const VALID_BRANDS = ['LLIF', 'BestLife'];

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.json({ ok: true, agent: 'brand-asset-compiler', version: '1.0.0' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/compile', async (req, res) => {
  const { brandKey, force = false } = req.body ?? {};

  if (!brandKey || typeof brandKey !== 'string') {
    return res.status(400).json({ error: 'brandKey is required' });
  }
  if (!VALID_BRANDS.includes(brandKey)) {
    return res.status(400).json({ error: `brandKey must be one of: ${VALID_BRANDS.join(', ')}` });
  }

  try {
    const result = await compileBrandAssets({ brandKey, force: Boolean(force) });
    const markdown = buildMarkdown(result);
    res.json({
      result: markdown,
      brandKey: result.brandKey,
      generated: result.generated,
      skipped: result.skipped,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error('[brand-asset-compiler] Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

function buildMarkdown({ brandKey, generated, skipped, warnings }) {
  const lines = [
    `# Brand Asset Compiler — ${brandKey}`,
    '',
    `**Generated:** ${generated.length} file${generated.length !== 1 ? 's' : ''}`,
    `**Skipped:** ${skipped.length} file${skipped.length !== 1 ? 's' : ''} (already exist; pass \`force: true\` to overwrite)`,
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
    lines.push('', '## Skipped (already exist)');
    skipped.forEach((f) => lines.push(`- \`${f}\``));
  }
  return lines.join('\n');
}

app.listen(PORT, () => {
  console.log(`[brand-asset-compiler] Listening on port ${PORT}`);
});
