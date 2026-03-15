import { Command } from 'commander';
import { getConfigManager } from '../lib/config.js';
import { success, error, output, isJsonMode } from '../utils/output.js';

export const logoutCommand = new Command('logout')
  .description('Log out and clear stored credentials')
  .action(() => {
    const mgr = getConfigManager();

    if (!mgr.isAuthenticated()) {
      error('Not currently authenticated.');
      if (isJsonMode()) {
        output({ status: 'ok', message: 'Not authenticated' });
      }
      return;
    }

    mgr.clearConfig();
    success('Logged out successfully.');

    if (isJsonMode()) {
      output({ status: 'ok' });
    }
  });
