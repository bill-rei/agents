/**
 * marketing-video-producer/tests/xai-video.test.js
 *
 * Tests for lib/xai-video.js using a mocked fetch.
 *
 * Run: node --test 'marketing-video-producer/tests/*.test.js'
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Mock global fetch ────────────────────────────────────────────────────────

let mockFetch;
global.fetch = (...args) => mockFetch(...args);

function makeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => Buffer.from('fakevideobytes').buffer,
  };
}

// ─── Import after patching fetch ─────────────────────────────────────────────

const {
  createVideoJob,
  getVideoJobStatus,
  pollVideoReady,
  downloadVideo,
  generateVideo,
} = require('../../lib/xai-video');

// ─── Setup ────────────────────────────────────────────────────────────────────

before(() => {
  process.env.XAI_API_KEY = 'test-key-12345';
});

after(() => {
  delete process.env.XAI_API_KEY;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('lib/xai-video createVideoJob', () => {
  it('sends correct POST request and returns jobId', async () => {
    let capturedUrl, capturedBody, capturedHeaders;

    mockFetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      capturedHeaders = opts.headers;
      return makeResponse({ id: 'job_abc123' });
    };

    const jobId = await createVideoJob({
      prompt: 'A calm data dashboard animation',
      aspectRatio: '16:9',
      durationSeconds: 10,
    });

    assert.strictEqual(jobId, 'job_abc123');
    assert.ok(capturedUrl.includes('/v1/video/generations'));
    assert.strictEqual(capturedBody.prompt, 'A calm data dashboard animation');
    assert.strictEqual(capturedBody.aspect_ratio, '16:9');
    assert.strictEqual(capturedBody.duration_seconds, 10);
    assert.ok(capturedHeaders['Authorization'].includes('Bearer test-key-12345'));
  });

  it('throws on non-ok response', async () => {
    mockFetch = async () => makeResponse({ error: { message: 'Rate limit exceeded' } }, 429);

    await assert.rejects(
      () => createVideoJob({ prompt: 'test', aspectRatio: '1:1', durationSeconds: 5 }),
      /createJob failed.*429/
    );
  });

  it('throws if response has no id', async () => {
    mockFetch = async () => makeResponse({ result: 'ok' }); // missing id

    await assert.rejects(
      () => createVideoJob({ prompt: 'test', aspectRatio: '1:1', durationSeconds: 5 }),
      /did not return a job id/
    );
  });

  it('includes referenceImageUrl when provided', async () => {
    let capturedBody;
    mockFetch = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return makeResponse({ id: 'job_xyz' });
    };

    await createVideoJob({
      prompt: 'Product reveal',
      aspectRatio: '9:16',
      durationSeconds: 5,
      referenceImageUrl: 'https://example.com/ref.png',
    });

    assert.strictEqual(capturedBody.reference_image_url, 'https://example.com/ref.png');
  });
});

describe('lib/xai-video getVideoJobStatus', () => {
  it('returns completed status with videoUrl', async () => {
    mockFetch = async () => makeResponse({
      status: 'completed',
      video_url: 'https://cdn.x.ai/video/abc.mp4',
    });

    const result = await getVideoJobStatus('job_abc');
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.videoUrl, 'https://cdn.x.ai/video/abc.mp4');
  });

  it('handles output.video_url fallback', async () => {
    mockFetch = async () => makeResponse({
      status: 'completed',
      output: { video_url: 'https://cdn.x.ai/video/def.mp4' },
    });

    const { videoUrl } = await getVideoJobStatus('job_def');
    assert.strictEqual(videoUrl, 'https://cdn.x.ai/video/def.mp4');
  });

  it('returns failed status with reason', async () => {
    mockFetch = async () => makeResponse({
      status: 'failed',
      failure_reason: 'Content policy violation',
    });

    const { status, failureReason } = await getVideoJobStatus('job_fail');
    assert.strictEqual(status, 'failed');
    assert.strictEqual(failureReason, 'Content policy violation');
  });
});

describe('lib/xai-video pollVideoReady', () => {
  it('resolves immediately when job is already completed', async () => {
    mockFetch = async () => makeResponse({
      status: 'completed',
      video_url: 'https://cdn.x.ai/video/ready.mp4',
    });

    const url = await pollVideoReady('job_ready', { maxAttempts: 3, intervalMs: 0 });
    assert.strictEqual(url, 'https://cdn.x.ai/video/ready.mp4');
  });

  it('polls until completed', async () => {
    let callCount = 0;
    mockFetch = async () => {
      callCount++;
      if (callCount < 3) {
        return makeResponse({ status: 'processing' });
      }
      return makeResponse({ status: 'completed', video_url: 'https://cdn.x.ai/video/done.mp4' });
    };

    const url = await pollVideoReady('job_poll', { maxAttempts: 10, intervalMs: 0 });
    assert.strictEqual(url, 'https://cdn.x.ai/video/done.mp4');
    assert.strictEqual(callCount, 3);
  });

  it('throws when job fails', async () => {
    mockFetch = async () => makeResponse({ status: 'failed', failure_reason: 'GPU timeout' });

    await assert.rejects(
      () => pollVideoReady('job_fail', { maxAttempts: 3, intervalMs: 0 }),
      /GPU timeout/
    );
  });

  it('throws on timeout', async () => {
    mockFetch = async () => makeResponse({ status: 'processing' });

    await assert.rejects(
      () => pollVideoReady('job_timeout', { maxAttempts: 2, intervalMs: 0 }),
      /timed out/
    );
  });
});

describe('lib/xai-video downloadVideo', () => {
  it('returns a Buffer of video bytes', async () => {
    mockFetch = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('MP4DATA').buffer,
    });

    const buf = await downloadVideo('https://cdn.x.ai/video/test.mp4');
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 0);
  });

  it('throws on non-ok download response', async () => {
    mockFetch = async () => ({ ok: false, status: 403 });

    await assert.rejects(
      () => downloadVideo('https://cdn.x.ai/video/403.mp4'),
      /403/
    );
  });
});

describe('lib/xai-video throws without API key', () => {
  it('createVideoJob throws if XAI_API_KEY is missing', async () => {
    const orig = process.env.XAI_API_KEY;
    delete process.env.XAI_API_KEY;

    await assert.rejects(
      () => createVideoJob({ prompt: 'test', aspectRatio: '1:1', durationSeconds: 5 }),
      /XAI_API_KEY is not set/
    );

    process.env.XAI_API_KEY = orig;
  });
});
