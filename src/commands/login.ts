import { Command } from 'commander';
import { runBrowserAuthFlow, runApiKeyAuthFlow } from '../lib/auth-flow.js';
import { getConfigManager } from '../lib/config.js';
import { error, output, isJsonMode } from '../utils/output.js';
import { EXIT_CODES } from '../lib/constants.js';

export const loginCommand = new Command('login')
  .description('Authenticate with the Shyft platform')
  .option('--api-key <key>', 'Authenticate with an API key (for CI/scripts)')
  .option('--no-browser', 'Print the auth URL instead of opening a browser')
  .action(async (options) => {
    const mgr = getConfigManager();

    if (mgr.isAuthenticated()) {
      const config = mgr.loadConfig();
      const method = config.accessToken ? 'browser session' : 'API key';
      error(`Already authenticated via ${method} as ${config.email}. Run \`shyft logout\` first.`);
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }

    let result: { success: boolean; error?: string };

    if (options.apiKey) {
      result = await runApiKeyAuthFlow(options.apiKey);
    } else {
      result = await runBrowserAuthFlow();
    }

    if (!result.success) {
      error(result.error || 'Authentication failed');
      process.exit(EXIT_CODES.AUTH_FAILED);
    }

    if (isJsonMode()) {
      const config = mgr.loadConfig();
      output({
        status: 'ok',
        email: config.email,
        teamId: config.teamId,
        teamName: config.teamName,
      });
    }
  });
