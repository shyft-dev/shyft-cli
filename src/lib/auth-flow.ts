import { hostname, platform, release } from 'os';
import { getPublicApiClient } from './api-client.js';
import { getConfigManager } from './config.js';
import { openBrowser } from '../utils/open-browser.js';
import {
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
} from '../utils/spinner.js';
import { info, success } from '../utils/output.js';

interface AuthSession {
  authUrl: string;
  pollToken: string;
  sessionCode: string;
}

interface PollResponse {
  status: 'pending' | 'approved' | 'expired';
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
  email?: string;
  teamId?: string;
  teamName?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBrowserAuthFlow(): Promise<{ success: boolean; error?: string }> {
  const client = getPublicApiClient();
  const mgr = getConfigManager();

  try {
    startSpinner('Creating auth session...');

    const { data: session } = await client.post<AuthSession>('/cli-auth/sessions', {
      cliVersion: '0.1.0',
      os: `${platform()} ${release()}`,
      hostname: hostname(),
    });

    updateSpinner('Waiting for browser authorization...');

    try {
      await openBrowser(session.authUrl);
      info(`\nOpened browser to: ${session.authUrl}`);
    } catch {
      info(`\nPlease open this URL in your browser:\n${session.authUrl}`);
    }

    info(`\nSession code: ${session.sessionCode}`);
    info('Waiting for authorization...\n');

    const timeoutMs = 300_000;
    const intervalMs = 2_000;
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < timeoutMs) {
      attempt++;
      if (attempt % 10 === 0) {
        updateSpinner(`Waiting for authorization... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
      }

      try {
        const { data: pollResponse } = await client.get<PollResponse>('/cli-auth/sessions/poll', {
          params: { token: session.pollToken },
        });

        if (pollResponse.status === 'approved' && pollResponse.accessToken) {
          await client.post('/cli-auth/sessions/claim', {
            pollToken: session.pollToken,
          });

          mgr.updateConfig({
            accessToken: pollResponse.accessToken,
            refreshToken: pollResponse.refreshToken,
            expiresAt: pollResponse.expiresAt,
            userId: pollResponse.userId,
            email: pollResponse.email,
            teamId: pollResponse.teamId,
            teamName: pollResponse.teamName,
          });

          succeedSpinner('Authenticated successfully!');
          success(`Logged in as ${pollResponse.email}`);
          return { success: true };
        }

        if (pollResponse.status === 'expired') {
          failSpinner('Session expired');
          return { success: false, error: 'Session expired. Please try again.' };
        }
      } catch (err) {
        failSpinner('Authorization failed');
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
      }

      await sleep(intervalMs);
    }

    failSpinner('Authorization timed out');
    return { success: false, error: 'Session timed out. Please try again.' };
  } catch (err) {
    failSpinner('Failed to start auth flow');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function runApiKeyAuthFlow(apiKey: string): Promise<{ success: boolean; error?: string }> {
  const client = getPublicApiClient();
  const mgr = getConfigManager();

  try {
    startSpinner('Validating API key...');

    const { data } = await client.get<{ userId: string; email: string; teamId?: string; teamName?: string }>(
      '/auth/me',
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    mgr.updateConfig({
      apiKey,
      userId: data.userId,
      email: data.email,
      teamId: data.teamId,
      teamName: data.teamName,
    });

    succeedSpinner('API key validated!');
    success(`Logged in as ${data.email}`);
    return { success: true };
  } catch (err) {
    failSpinner('Invalid API key');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
