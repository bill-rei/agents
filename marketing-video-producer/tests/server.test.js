/**
 * marketing-video-producer/tests/server.test.js
 *
 * Tests for the marketing-video-producer Express server.
 * Uses node:test + supertest-style manual fetch against a started server.
 *
 * Run: node --test 'marketing-video-producer/tests/*.test.js'
 *
 * The LLM call (lib/llm.js) is mocked by overriding the module before import.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// ─── Mock lib/llm.js before requiring the server ─────────────────────────────

// Intercept require('../../lib/llm') calls from the server
const Module = require('module');
const originalLoad = Module._load;

let mockLlmResponse = null;

Module._load = function (request, parent, isMain) {
  if (request.includes('lib/llm') || request === '../lib/llm') {
    return {
      compile: async (_userMessage, _systemPrompt) => {
        if (mockLlmResponse === null) {
          throw new Error('mockLlmResponse not set');
        }
        return mockLlmResponse;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function post(server, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const addr = server.address();
    const port = addr.port;
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Valid base request
const VALID_REQUEST = {
  campaign_id: 'camp_001',
  brand: 'llif',
  brief: 'Show the app tracking health data over time, calm and professional.',
  channels: ['linkedin', 'instagram'],
  source_assets: [],
  variants: [
    { variant_id: 'v1', aspect_ratio: '16:9', duration_seconds: 10 },
    { variant_id: 'v2', aspect_ratio: '9:16', duration_seconds: 5 },
  ],
  notes: '',
};

// A valid LLM plan response
const VALID_PLAN = {
  refused: false,
  brand: 'llif',
  campaign_id: 'camp_001',
  safety_check: { passed: true, flags: [] },
  prompts: [
    {
      variant_id: 'v1',
      aspect_ratio: '16:9',
      duration_seconds: 10,
      prompt: 'Wide cinematic shot of a minimalist dashboard showing health metrics gliding across a dark screen.',
      negative_prompt: 'text, watermarks, logos, faces, medical imagery',
    },
    {
      variant_id: 'v2',
      aspect_ratio: '9:16',
      duration_seconds: 5,
      prompt: 'Close-up vertical shot of a smartphone app showing calm data visualizations.',
      negative_prompt: 'text, watermarks, logos, faces, medical imagery',
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('marketing-video-producer server', () => {
  let server;

  before(() => {
    // Load the server fresh (after mock is installed)
    process.env.VIDEO_PRODUCER_PORT = '0'; // use any free port
    const app = require('../server');
    server = app.listen(0);
  });

  after(() => {
    server.close();
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it('rejects requests missing campaign_id', async () => {
    const { campaign_id: _, ...noId } = VALID_REQUEST;
    const { status, body } = await post(server, '/api/compile', noId);
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('campaign_id'));
  });

  it('rejects requests with invalid brand', async () => {
    const { status, body } = await post(server, '/api/compile', {
      ...VALID_REQUEST,
      brand: 'otherbrand',
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('brand'));
  });

  it('rejects requests with empty variants array', async () => {
    const { status, body } = await post(server, '/api/compile', {
      ...VALID_REQUEST,
      variants: [],
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('variants'));
  });

  it('rejects variants with invalid aspect_ratio', async () => {
    const { status, body } = await post(server, '/api/compile', {
      ...VALID_REQUEST,
      variants: [{ variant_id: 'v1', aspect_ratio: '4:3', duration_seconds: 10 }],
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('aspect_ratio'));
  });

  it('rejects variants with invalid duration_seconds', async () => {
    const { status, body } = await post(server, '/api/compile', {
      ...VALID_REQUEST,
      variants: [{ variant_id: 'v1', aspect_ratio: '16:9', duration_seconds: 30 }],
    });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes('duration_seconds'));
  });

  // ── Safety gate refusal ─────────────────────────────────────────────────────

  it('passes through LLM refusal with 422', async () => {
    mockLlmResponse = JSON.stringify({
      refused: true,
      reason: 'Contains medical claim: "clinically proven"',
      gate: 'medical_claims',
    });

    const { status, body } = await post(server, '/api/compile', {
      ...VALID_REQUEST,
      brief: 'Clinically proven to improve health outcomes.',
    });

    assert.strictEqual(status, 422);
    assert.strictEqual(body.refused, true);
    assert.ok(body.error.includes('Safety gate'));
    assert.strictEqual(body.gate, 'medical_claims');
  });

  // ── Successful plan ─────────────────────────────────────────────────────────

  it('returns structured plan on valid input', async () => {
    mockLlmResponse = JSON.stringify(VALID_PLAN);

    const { status, body } = await post(server, '/api/compile', VALID_REQUEST);

    assert.strictEqual(status, 200);
    assert.ok(typeof body.result === 'string', 'result should be a JSON string');

    const plan = JSON.parse(body.result);
    assert.strictEqual(plan.refused, false);
    assert.ok(Array.isArray(plan.prompts));
    assert.strictEqual(plan.prompts.length, 2);
    assert.strictEqual(plan.prompts[0].variant_id, 'v1');
    assert.ok(plan.prompts[0].prompt.length > 0);
  });

  it('strips markdown fences from LLM output if present', async () => {
    mockLlmResponse = '```json\n' + JSON.stringify(VALID_PLAN) + '\n```';

    const { status, body } = await post(server, '/api/compile', VALID_REQUEST);
    assert.strictEqual(status, 200);
    const plan = JSON.parse(body.result);
    assert.strictEqual(plan.refused, false);
  });

  it('returns 500 when LLM returns non-JSON output', async () => {
    mockLlmResponse = 'Sorry, I cannot help with that.';

    const { status, body } = await post(server, '/api/compile', VALID_REQUEST);
    assert.strictEqual(status, 500);
    assert.ok(body.error.includes('non-JSON'));
  });

  it('returns 500 when LLM returns plan with no prompts', async () => {
    mockLlmResponse = JSON.stringify({ ...VALID_PLAN, prompts: [] });

    const { status } = await post(server, '/api/compile', VALID_REQUEST);
    assert.strictEqual(status, 500);
  });

  // ── Brand boundary ──────────────────────────────────────────────────────────

  it('accepts bestlife brand', async () => {
    mockLlmResponse = JSON.stringify({ ...VALID_PLAN, brand: 'bestlife' });

    const { status } = await post(server, '/api/compile', {
      ...VALID_REQUEST,
      brand: 'bestlife',
    });
    assert.strictEqual(status, 200);
  });
});
