/**
 * marketing-video-producer/server.js
 *
 * Marketing Video Producer Agent — Express server
 * Port: process.env.VIDEO_PRODUCER_PORT || 3008
 *
 * Endpoint: POST /api/compile
 *
 * Responsibilities:
 *   1. Validate the video brief against safety gates (via LLM + system prompt)
 *   2. Generate precise xAI Imagine Video prompts for each requested variant
 *   3. Return a structured plan — the portal API route handles actual generation + upload
 *
 * The LLM step (system-prompt.js) does safety enforcement and prompt engineering.
 * This server never calls xAI directly — it's a prompt planner, not an executor.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const { compile } = require('../lib/llm');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.VIDEO_PRODUCER_PORT || 3008;

app.use(express.json({ limit: '512kb' }));

/**
 * POST /api/compile
 *
 * Body (JSON):
 * {
 *   campaign_id:   string
 *   brand:         'llif' | 'bestlife'
 *   brief:         string
 *   channels:      string[]
 *   source_assets: Array<{ type, url, description }>
 *   variants:      Array<{ variant_id, aspect_ratio, duration_seconds }>
 *   notes?:        string
 * }
 *
 * Response:
 * { result: "<JSON string of plan or refusal>" }
 */
app.post('/api/compile', async (req, res) => {
  try {
    const { campaign_id, brand, brief, channels, source_assets, variants, notes } = req.body;

    // ── Basic input validation ─────────────────────────────────────────────────
    const missing = [];
    if (!campaign_id) missing.push('campaign_id');
    if (!brand) missing.push('brand');
    if (!brief) missing.push('brief');
    if (!Array.isArray(variants) || variants.length === 0) missing.push('variants');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    if (brand !== 'llif' && brand !== 'bestlife') {
      return res.status(400).json({ error: `Invalid brand "${brand}". Must be "llif" or "bestlife".` });
    }

    const VALID_RATIOS = ['9:16', '16:9', '1:1'];
    const VALID_DURATIONS = [5, 10, 15];

    for (const v of variants) {
      if (!v.variant_id) return res.status(400).json({ error: 'Each variant must have a variant_id' });
      if (!VALID_RATIOS.includes(v.aspect_ratio)) {
        return res.status(400).json({ error: `Invalid aspect_ratio "${v.aspect_ratio}". Use one of: ${VALID_RATIOS.join(', ')}` });
      }
      if (!VALID_DURATIONS.includes(v.duration_seconds)) {
        return res.status(400).json({ error: `Invalid duration_seconds "${v.duration_seconds}". Use one of: ${VALID_DURATIONS.join(', ')}` });
      }
    }

    // ── Build the LLM user message ─────────────────────────────────────────────
    const briefPayload = {
      campaign_id,
      brand,
      brief,
      channels: channels || [],
      source_assets: source_assets || [],
      variants,
      notes: notes || '',
    };

    const userMessage = [
      'Generate video prompts for the following brief.',
      'Return ONLY a valid JSON object matching the output contract.',
      'Do not include markdown code fences or explanation — raw JSON only.',
      '',
      JSON.stringify(briefPayload, null, 2),
    ].join('\n');

    // ── Call LLM (safety check + prompt generation) ────────────────────────────
    const rawResult = await compile(userMessage, SYSTEM_PROMPT);

    // ── Parse and validate the LLM response ───────────────────────────────────
    let plan;
    try {
      // Strip markdown fences if the LLM adds them despite instructions
      const cleaned = rawResult.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim();
      plan = JSON.parse(cleaned);
    } catch {
      // If LLM returned unparseable output, surface it clearly
      return res.status(500).json({
        error: 'Video producer returned non-JSON output',
        rawOutput: rawResult.slice(0, 500),
      });
    }

    // If the LLM refused, pass it through as a 422 so the caller can surface it
    if (plan.refused) {
      return res.status(422).json({
        error: `Safety gate triggered: ${plan.reason}`,
        gate: plan.gate,
        refused: true,
      });
    }

    // Validate minimal required structure
    if (!Array.isArray(plan.prompts) || plan.prompts.length === 0) {
      return res.status(500).json({
        error: 'Video producer returned no prompts',
        rawOutput: rawResult.slice(0, 500),
      });
    }

    res.json({ result: JSON.stringify(plan) });
  } catch (err) {
    console.error('[marketing-video-producer] Error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// Health check
app.get('/', (_req, res) => res.json({ agent: 'marketing-video-producer', status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Marketing Video Producer running on http://localhost:${PORT}`);
});

module.exports = app; // exported for testing
