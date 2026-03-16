import axios, { type AxiosInstance } from 'axios';
import { getConfigManager } from './config.js';
import { DEFAULT_API_URL } from './constants.js';
import { shouldRefreshToken, refreshAccessToken } from './token-refresh.js';

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
    client.interceptors.request.use(async (requestConfig) => {
      const mgr = getConfigManager();
      if (!mgr.isAuthenticated()) {
        throw new ApiClientError(
          'Not authenticated. Run `shyft login` first.',
          'auth_required',
          401,
        );
      }

      // Proactive token refresh
      if (shouldRefreshToken()) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          throw new ApiClientError(
            'Session expired. Run `shyft login` to re-authenticate.',
            'auth_required',
            401,
          );
        }
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
        const apiError = data?.error;
        throw new ApiClientError(
          apiError?.message || err.message,
          apiError?.code || 'api_error',
          status,
          apiError?.details,
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
