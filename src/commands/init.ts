import { Command } from 'commander';
import { getProjectConfigManager } from '../lib/project-config.js';
import { getApiClient, ApiClientError } from '../lib/api-client.js';
import { getConfigManager } from '../lib/config.js';
import { output, success, info, error, isJsonMode } from '../utils/output.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { EXIT_CODES } from '../lib/constants.js';

const ALL_PHASES = ['ideate', 'plan', 'build', 'verify'];

export function buildCreateProductPayload(name: string, description: string): { name: string; description?: string } {
  const trimmedName = name.trim();
  const payload: { name: string; description?: string } = { name: trimmedName };
  const trimmedDesc = description.trim();
  if (trimmedDesc) {
    payload.description = trimmedDesc;
  }
  return payload;
}

async function askQuestion(prompt: string): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(prompt, resolve);
  });
  rl.close();
  return answer;
}

async function askYesNo(prompt: string): Promise<boolean> {
  const answer = await askQuestion(`${prompt} (y/N): `);
  return answer.trim().toLowerCase() === 'y';
}

async function createProduct(name: string, description: string): Promise<string> {
  const spinner = startSpinner('Creating product...');
  try {
    const client = getApiClient();
    const payload = buildCreateProductPayload(name, description);
    const { data } = await client.post('/products', payload);
    succeedSpinner(`Product created: ${data.name} (${data.id})`);
    return data.id;
  } catch (err) {
    failSpinner('Failed to create product.');
    if (err instanceof ApiClientError) {
      error(err.message);
      process.exit(EXIT_CODES.API_ERROR);
    }
    throw err;
  }
}

async function selectOrCreateProduct(): Promise<string> {
  const spinner = startSpinner('Fetching products...');
  let products: Array<{ id: string; name: string }> = [];
  try {
    const client = getApiClient();
    const { data } = await client.get('/products');
    succeedSpinner('Products loaded.');
    products = data || [];
  } catch (err) {
    failSpinner('Failed to fetch products.');
    if (err instanceof ApiClientError) {
      error(err.message);
      process.exit(EXIT_CODES.API_ERROR);
    }
    throw err;
  }

  info('');
  for (let i = 0; i < products.length; i++) {
    info(`  ${i + 1}. ${products[i].name} (${products[i].id})`);
  }
  if (products.length > 0) {
    info(`  ${'─'.repeat(40)}`);
  }
  info(`  ${products.length + 1}. + Create a new product`);
  info('');

  const answer = await askQuestion('Select an option (number): ');
  const index = parseInt(answer, 10) - 1;

  if (isNaN(index) || index < 0 || index > products.length) {
    error('Invalid selection.');
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }

  // User chose "Create a new product"
  if (index === products.length) {
    const name = await askQuestion('Product name: ');
    if (!name.trim()) {
      error('Product name is required.');
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
    const description = await askQuestion('Description (optional): ');
    return createProduct(name, description);
  }

  return products[index].id;
}

export const initCommand = new Command('init')
  .description('Initialize Shyft project config for this directory')
  .option('--product <id>', 'Product ID to associate with this project')
  .option('--name <name>', 'Name for a new product (used with product creation)')
  .option('--description <desc>', 'Description for a new product')
  .action(async (opts) => {
    const configMgr = getConfigManager();
    if (!configMgr.isAuthenticated()) {
      error('Not authenticated. Run: shyft login');
      process.exit(EXIT_CODES.AUTH_REQUIRED);
    }

    const projMgr = getProjectConfigManager();

    // Handle re-initialization
    if (projMgr.exists()) {
      const config = projMgr.load();
      if (isJsonMode()) {
        // In JSON mode with --product or --name, allow re-init silently
        if (!opts.product && !opts.name) {
          output(config);
          return;
        }
      } else {
        info('Project already initialized (.shyft/config.json exists).');
        info(`  Current product: ${config.productId || '(not set)'}`);
        const confirmed = await askYesNo('Reconfigure this project?');
        if (!confirmed) {
          info('Keeping existing configuration.');
          return;
        }
      }
    }

    let productId = opts.product;

    // If --name is provided, create a new product (CI-friendly)
    if (!productId && opts.name) {
      productId = await createProduct(opts.name, opts.description || '');
    }

    // Interactive selection
    if (!productId) {
      if (isJsonMode()) {
        error('Use --product <id> or --name <name> to specify product in JSON mode.');
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }
      productId = await selectOrCreateProduct();
    }

    // When re-initializing, only change the productId — preserve other settings
    if (projMgr.exists()) {
      projMgr.update({ productId });
    } else {
      projMgr.update({
        productId,
        activePhases: ALL_PHASES,
        phaseCustomizations: {},
      });
    }

    success('Project initialized.');
    if (isJsonMode()) {
      output(projMgr.load());
    } else {
      info(`  Config:  .shyft/config.json`);
      info(`  Product: ${productId}`);
      info('');
      info('Next steps:');
      info('  1. Commit .shyft/config.json to your repo');
      info('  2. Install the shyft-skills plugin in your coding agent');
      info('  3. Run /shyft:ideate to start building a feature');
    }
  });
