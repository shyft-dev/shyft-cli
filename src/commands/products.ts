import { Command } from 'commander';
import { getApiClient, ApiClientError } from '../lib/api-client.js';
import { buildCreateProductPayload } from './init.js';
import { output, info, error, isJsonMode } from '../utils/output.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { EXIT_CODES } from '../lib/constants.js';

function handleApiError(err: unknown): never {
  if (err instanceof ApiClientError) {
    error(err.message);
    if (err.status === 404) process.exit(EXIT_CODES.GENERAL_ERROR);
    if (err.status === 401) process.exit(EXIT_CODES.AUTH_REQUIRED);
    process.exit(EXIT_CODES.API_ERROR);
  }
  throw err;
}

export const productsCommand = new Command('products')
  .description('Manage products');

productsCommand
  .command('list')
  .description('List all products')
  .action(async () => {
    const spinner = startSpinner('Fetching products...');
    try {
      const client = getApiClient();
      const { data } = await client.get('/products');
      succeedSpinner('Products loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        if (!data || data.length === 0) {
          info('No products found.');
          return;
        }
        info('');
        info(`  ${'ID'.padEnd(28)} ${'Name'.padEnd(30)} Description`);
        info(`  ${'─'.repeat(28)} ${'─'.repeat(30)} ${'─'.repeat(30)}`);
        for (const p of data) {
          const desc = p.description ? p.description.slice(0, 30) : '';
          info(`  ${String(p.id).padEnd(28)} ${String(p.name).padEnd(30)} ${desc}`);
        }
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch products.');
      handleApiError(err);
    }
  });

productsCommand
  .command('get <id>')
  .description('Get product by ID')
  .action(async (id: string) => {
    const spinner = startSpinner('Fetching product...');
    try {
      const client = getApiClient();
      const { data } = await client.get(`/products/${id}`);
      succeedSpinner('Product loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        info('');
        info(`  ID:           ${data.id}`);
        info(`  Name:         ${data.name}`);
        info(`  Description:  ${data.description || '(none)'}`);
        info(`  Repositories: ${data.repositoryIds?.length ?? 0}`);
        if (data.featureCounts) {
          info(`  Features:     ${JSON.stringify(data.featureCounts)}`);
        }
        info(`  Created:      ${data.createdAt}`);
        info(`  Updated:      ${data.updatedAt}`);
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch product.');
      handleApiError(err);
    }
  });

productsCommand
  .command('create')
  .description('Create a new product')
  .requiredOption('--name <name>', 'Product name')
  .option('--description <desc>', 'Product description')
  .action(async (opts) => {
    const spinner = startSpinner('Creating product...');
    try {
      const client = getApiClient();
      const payload = buildCreateProductPayload(opts.name, opts.description || '');
      const { data } = await client.post('/products', payload);
      succeedSpinner('Product created.');

      if (isJsonMode()) {
        output(data);
      } else {
        info('');
        info(`  ID:          ${data.id}`);
        info(`  Name:        ${data.name}`);
        info(`  Description: ${data.description || '(none)'}`);
        info('');
      }
    } catch (err) {
      failSpinner('Failed to create product.');
      handleApiError(err);
    }
  });
