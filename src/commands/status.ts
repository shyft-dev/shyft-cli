import { Command } from 'commander';
import { getConfigManager } from '../lib/config.js';
import { output, info, error, isJsonMode } from '../utils/output.js';
import { EXIT_CODES } from '../lib/constants.js';

export const statusCommand = new Command('status')
  .description('Show current authentication status')
  .action(() => {
    const mgr = getConfigManager();
    const config = mgr.loadConfig();

    if (!mgr.isAuthenticated()) {
      if (isJsonMode()) {
        output({ authenticated: false });
      } else {
        error('Not authenticated. Run `shyft login` to get started.');
      }
      process.exit(EXIT_CODES.AUTH_REQUIRED);
    }

    const method = config.accessToken ? 'browser' : 'api-key';

    if (isJsonMode()) {
      output({
        authenticated: true,
        method,
        email: config.email ?? null,
        userId: config.userId ?? null,
        teamId: config.teamId ?? null,
        teamName: config.teamName ?? null,
        expiresAt: config.expiresAt ?? null,
        apiUrl: config.apiUrl ?? null,
      });
    } else {
      info(`  Auth method: ${method}`);
      if (config.email) info(`  Email:       ${config.email}`);
      if (config.teamName) info(`  Team:        ${config.teamName}`);
      if (config.expiresAt) info(`  Expires:     ${config.expiresAt}`);
      if (config.apiUrl) info(`  API URL:     ${config.apiUrl}`);
    }
  });
