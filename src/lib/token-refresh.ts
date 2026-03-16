import axios from 'axios';
import { getConfigManager } from './config.js';
import { DEFAULT_API_URL } from './constants.js';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

export function shouldRefreshToken(): boolean {
  const config = getConfigManager().loadConfig();

  // Skip for API key auth (no expiry)
  if (!config.accessToken || !config.expiresAt) return false;

  const expiresAt = new Date(config.expiresAt).getTime();
  return Date.now() > expiresAt - REFRESH_BUFFER_MS;
}

export async function refreshAccessToken(): Promise<boolean> {
  const mgr = getConfigManager();
  const config = mgr.loadConfig();

  if (!config.refreshToken) return false;

  const apiUrl = config.apiUrl || process.env.SHYFT_API_URL || DEFAULT_API_URL;

  try {
    const { data } = await axios.post<{
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    }>(`${apiUrl}/auth/token/refresh`, {
      refreshToken: config.refreshToken,
    });

    mgr.updateConfig({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
    });

    return true;
  } catch {
    // Refresh failed — clear auth state
    mgr.clearConfig();
    return false;
  }
}
