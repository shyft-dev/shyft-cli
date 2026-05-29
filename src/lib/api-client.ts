import axios, { type AxiosInstance } from 'axios';
import { gzipSync } from 'node:zlib';
import { getConfigManager } from './config.js';
import { DEFAULT_API_URL } from './constants.js';

export class ApiClientError extends Error {
  code: string;
  status?: number;
  details?: unknown;

  constructor(message: string, code: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Gzip a JSON write body so it survives Render's Cloudflare WAF body inspection.
 *
 * The WAF 403s any request body that pattern-matches injection traffic — which
 * user-authored markdown specs/plans (code fences, SQL/HTML snippets) reliably
 * trigger regardless of size. So by default we gzip EVERY write body, not just
 * large ones: a 200-byte intent containing "DROP TABLE" is as blockable as a
 * 15KB one. The server decompresses `Content-Encoding: gzip` transparently.
 *
 * Returns a Buffer (axios sends Buffers verbatim — no JSON re-serialization)
 * plus the headers to merge. `thresholdBytes` can be raised by a caller that
 * wants to skip compression for trivially small bodies, but it defaults to 0
 * (always compress) so no write is ever sent in cleartext.
 *
 * NOTE: requires a server that decompresses inbound gzip. Ship the API change
 * first; it is backwards-compatible (still accepts uncompressed bodies).
 */
export function gzipJsonBody(
  payload: unknown,
  thresholdBytes = 0,
): { data: Buffer | unknown; headers: Record<string, string> } {
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, 'utf-8') < thresholdBytes) {
    return { data: payload, headers: {} };
  }
  const data = gzipSync(Buffer.from(json, 'utf-8'));
  return {
    data,
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  };
}

function getApiUrl(): string {
  const config = getConfigManager().loadConfig();
  return config.apiUrl || process.env.SHYFT_API_URL || DEFAULT_API_URL;
}

export function createApiClient(requireAuth = true): AxiosInstance {
  const baseURL = getApiUrl();

  const client = axios.create({
    baseURL,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
  });

  if (requireAuth) {
    client.interceptors.request.use((requestConfig) => {
      const mgr = getConfigManager();
      if (!mgr.isAuthenticated()) {
        throw new ApiClientError(
          'Not authenticated. Run `shyft login` first.',
          'auth_required',
          401,
        );
      }
      const authHeader = mgr.getAuthHeader();
      if (authHeader) {
        requestConfig.headers.Authorization = authHeader;
      }
      return requestConfig;
    });
  }

  client.interceptors.response.use(
    (response) => response,
    (err) => {
      if (err.response) {
        const { status, data } = err.response;
        const headers = err.response.headers ?? {};
        const server = String(headers['server'] ?? '').toLowerCase();
        const contentType = String(headers['content-type'] ?? '').toLowerCase();
        const reachedOrigin = Boolean(headers['rndr-id'] || headers['x-render-origin-server']);
        // A Cloudflare HTML response with no Render origin headers means the edge
        // handled the request itself — it never reached Shyft. Distinguish the
        // two reasons so we don't tell users to upgrade during an outage:
        //   403 => a managed WAF rule matched the body (the bug this CLI fixes).
        //   503 => origin unreachable (deploy/outage), transient.
        const edgeHandled =
          server.includes('cloudflare') && contentType.includes('text/html') && !reachedOrigin;
        if (status === 403 && edgeHandled) {
          throw new ApiClientError(
            'Request blocked at the WAF edge before reaching Shyft (HTTP 403). ' +
              'The payload may have tripped a managed firewall rule. ' +
              'Update to the latest CLI (`npm i -g @shyft-dev/cli@latest`) or contact support if it persists.',
            'waf_blocked',
            status,
          );
        }
        if (status === 503 && edgeHandled) {
          throw new ApiClientError(
            'Shyft is temporarily unavailable (HTTP 503) — the API origin could not be reached. ' +
              'This is usually transient (a deploy or restart); retry in a moment.',
            'service_unavailable',
            status,
          );
        }
        const apiError = data?.error;
        let message = apiError?.message || data?.message;
        if (!message) {
          if (typeof data === 'string' && data.trim()) {
            message = `${err.message}: ${data.slice(0, 500)}`;
          } else if (data && typeof data === 'object') {
            try {
              message = `${err.message}: ${JSON.stringify(data).slice(0, 500)}`;
            } catch {
              message = err.message;
            }
          } else {
            message = err.message;
          }
        }
        throw new ApiClientError(
          message,
          apiError?.code || 'api_error',
          status,
          apiError?.details ?? data,
        );
      }
      if (err.code === 'ECONNREFUSED') {
        throw new ApiClientError('Could not connect to Shyft API', 'connection_error');
      }
      if (err.code === 'ETIMEDOUT') {
        throw new ApiClientError('Request timed out', 'timeout');
      }
      throw new ApiClientError(err.message || 'Unknown error', 'unknown_error');
    },
  );

  return client;
}

export function getPublicApiClient(): AxiosInstance {
  return createApiClient(false);
}

export function getApiClient(): AxiosInstance {
  return createApiClient(true);
}
