import { Command } from 'commander';
import { getProjectConfigManager } from '../lib/project-config.js';
import { getApiClient, ApiClientError } from '../lib/api-client.js';
import { getConfigManager } from '../lib/config.js';
import { output, success, info, error, isJsonMode } from '../utils/output.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { EXIT_CODES } from '../lib/constants.js';

const ALL_PHASES = ['ideate', 'plan', 'build', 'verify'];

export const initCommand = new Command('init')
  .description('Initialize Shyft project config for this directory')
  .option('--product <id>', 'Product ID to associate with this project')
  .action(async (opts) => {
    const configMgr = getConfigManager();
    if (!configMgr.isAuthenticated()) {
      error('Not authenticated. Run: shyft login');
      process.exit(EXIT_CODES.AUTH_REQUIRED);
    }

    const projMgr = getProjectConfigManager();
    if (projMgr.exists()) {
      info('Project already initialized (.shyft/config.json exists).');
      const config = projMgr.load();
      if (isJsonMode()) {
        output(config);
      } else {
        info(`  Product: ${config.productId || '(not set)'}`);
        info(`  Phases:  ${config.activePhases.join(', ')}`);
      }
      return;
    }

    let productId = opts.product;

    if (!productId) {
      const spinner = startSpinner('Fetching products...');
      try {
        const client = getApiClient();
        const { data } = await client.get('/products');
        succeedSpinner('Products loaded.');

        if (!data || data.length === 0) {
          error('No products found. Create a product in the Shyft dashboard first.');
          process.exit(EXIT_CODES.VALIDATION_ERROR);
        }

        if (isJsonMode()) {
          error('Use --product <id> to specify product in JSON mode.');
          process.exit(EXIT_CODES.VALIDATION_ERROR);
        }

        info('\nAvailable products:');
        for (let i = 0; i < data.length; i++) {
          info(`  ${i + 1}. ${data[i].name} (${data[i].id})`);
        }

        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) => {
          rl.question('\nSelect a product (number): ', resolve);
        });
        rl.close();

        const index = parseInt(answer, 10) - 1;
        if (isNaN(index) || index < 0 || index >= data.length) {
          error('Invalid selection.');
          process.exit(EXIT_CODES.VALIDATION_ERROR);
        }

        productId = data[index].id;
      } catch (err) {
        failSpinner('Failed to fetch products.');
        if (err instanceof ApiClientError) {
          error(err.message);
          process.exit(EXIT_CODES.API_ERROR);
        }
        throw err;
      }
    }

    projMgr.update({
      productId,
      activePhases: ALL_PHASES,
      phaseCustomizations: {},
    });

    success('Project initialized.');
    if (isJsonMode()) {
      output(projMgr.load());
    } else {
      info(`  Config:  .shyft/config.json`);
      info(`  Product: ${productId}`);
      info(`  Phases:  ${ALL_PHASES.join(', ')}`);
      info('');
      info('Next steps:');
      info('  1. Commit .shyft/config.json to your repo');
      info('  2. Install the shyft-skills plugin in your coding agent');
      info('  3. Run /shyft:ideate to start building a feature');
    }
  });
