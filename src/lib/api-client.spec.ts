import { describe, test, expect } from 'bun:test';
import { gunzipSync } from 'node:zlib';
import { gzipJsonBody, createApiClient, ApiClientError } from './api-client.js';

describe('gzipJsonBody', () => {
  test('gzips every body by default (no cleartext write window)', () => {
    const payload = { title: 'hi', stage: 'build' };
    const result = gzipJsonBody(payload);

    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect(result.headers).toEqual({
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
    });
  });

  test('gzipped payload round-trips back to the original payload', () => {
    const payload = { content: 'y'.repeat(50000), allowOverwrite: true };
    const result = gzipJsonBody(payload);

    expect(Buffer.isBuffer(result.data)).toBe(true);
    const restored = JSON.parse(gunzipSync(result.data as Buffer).toString('utf-8'));
    expect(restored).toEqual(payload);
  });

  test('a body below an explicit threshold is passed through uncompressed', () => {
    const payload = { note: 'short' };
    const jsonLen = Buffer.byteLength(JSON.stringify(payload), 'utf-8');

    const result = gzipJsonBody(payload, jsonLen + 10);
    expect(result.data).toBe(payload);
    expect(result.headers).toEqual({});
  });
});

// These tests exercise the REAL response interceptor installed by
// createApiClient() — not a re-implementation. We stub axios' adapter so the
// request fails with a synthetic upstream response and assert on the
// ApiClientError the interceptor throws. If the interceptor is broken or
// removed, these fail.
function clientFailingWith(response: {
  status: number;
  headers: Record<string, unknown>;
  data: unknown;
}) {
  const client = createApiClient(false); // requireAuth=false → no auth interceptor
  client.defaults.adapter = async () => {
    const err = new Error(`Request failed with status ${response.status}`) as Error & {
      response: typeof response;
    };
    err.response = response;
    throw err;
  };
  return client;
}

async function captureError(p: Promise<unknown>): Promise<ApiClientError> {
  try {
    await p;
  } catch (err) {
    return err as ApiClientError;
  }
  throw new Error('expected the request to reject, but it resolved');
}

describe('response interceptor — Cloudflare edge classification', () => {
  test('403 Cloudflare HTML with no origin headers → waf_blocked, no HTML leak', async () => {
    const html =
      '<html><head><title>Blocked</title></head><body>' + 'z'.repeat(5000) + '</body></html>';
    const client = clientFailingWith({
      status: 403,
      headers: { server: 'cloudflare', 'content-type': 'text/html', 'cf-ray': 'abc123' },
      data: html,
    });

    const err = await captureError(client.patch('/features/x', Buffer.from('')));
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('waf_blocked');
    expect(err.status).toBe(403);
    // The raw 221KB Cloudflare HTML must never leak into the user-facing message.
    expect(err.message).not.toContain('<html>');
    expect(err.message).not.toContain('Blocked');
    expect(err.message).toContain('WAF edge');
  });

  test('503 Cloudflare HTML with no origin headers → service_unavailable (NOT waf_blocked)', async () => {
    const client = clientFailingWith({
      status: 503,
      headers: { server: 'cloudflare', 'content-type': 'text/html' },
      data: '<html>origin unreachable</html>',
    });

    const err = await captureError(client.get('/features/x'));
    expect(err.code).toBe('service_unavailable');
    expect(err.status).toBe(503);
    expect(err.message).not.toContain('Update to the latest CLI');
  });

  test('403 that reached origin (rndr-id present) is NOT classified as a WAF block', async () => {
    const client = clientFailingWith({
      status: 403,
      headers: {
        server: 'cloudflare',
        'content-type': 'application/json',
        'rndr-id': 'render-xyz',
        'x-render-origin-server': 'Render',
      },
      data: { error: { message: 'Forbidden', code: 'forbidden' } },
    });

    const err = await captureError(client.get('/features/x'));
    expect(err.code).not.toBe('waf_blocked');
    expect(err.code).toBe('forbidden');
  });

  test('origin JSON error surfaces its message and code', async () => {
    const client = clientFailingWith({
      status: 400,
      headers: { 'content-type': 'application/json', 'rndr-id': 'r1' },
      data: { error: { message: 'intent must be shorter than or equal to 200000 characters', code: 'validation_error' } },
    });

    const err = await captureError(client.patch('/features/x', Buffer.from('')));
    expect(err.code).toBe('validation_error');
    expect(err.message).toContain('intent must be shorter');
  });
});
