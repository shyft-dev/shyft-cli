import { Command } from 'commander';
import { getApiClient, ApiClientError } from '../lib/api-client.js';
import { getContextManager } from '../lib/context.js';
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

export const featuresCommand = new Command('features')
  .description('Manage features');

featuresCommand
  .command('list')
  .description('List features for a product')
  .option('--product <id>', 'Product ID')
  .option('--stage <stage>', 'Filter by stage (ideate, build, ship)')
  .option('--assignee <userId>', 'Filter by assignee')
  .action(async (opts: { product?: string; stage?: string; assignee?: string }) => {
    const ctx = getContextManager();
    let productId: string;
    try {
      productId = ctx.resolveProductId(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching features...');
    try {
      const client = getApiClient();
      const params: Record<string, string> = {};
      if (opts.stage) params.stage = opts.stage;
      if (opts.assignee) params.assignee = opts.assignee;

      const { data } = await client.get(`/products/${productId}/features`, { params });
      succeedSpinner('Features loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        if (!data || data.length === 0) {
          info('No features found.');
          return;
        }
        info('');
        info(`  ${'ID'.padEnd(28)} ${'Stage'.padEnd(8)} Title`);
        info(`  ${'─'.repeat(28)} ${'─'.repeat(8)} ${'─'.repeat(40)}`);
        for (const f of data) {
          info(`  ${String(f.id).padEnd(28)} ${String(f.stage).padEnd(8)} ${f.title}`);
        }
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch features.');
      handleApiError(err);
    }
  });

featuresCommand
  .command('get [id]')
  .description('Get feature by ID')
  .action(async (id?: string) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching feature...');
    try {
      const client = getApiClient();
      const { data } = await client.get(`/features/${featureId}`);
      succeedSpinner('Feature loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        info('');
        info(`  ID:        ${data.id}`);
        info(`  Product:   ${data.productId}`);
        info(`  Title:     ${data.title}`);
        info(`  Stage:     ${data.stage}`);
        info(`  Intent:    ${data.intent || '(none)'}`);
        if (data.assignee) info(`  Assignee:  ${data.assignee}`);
        if (data.linkedPRs?.length) {
          info(`  PRs:       ${data.linkedPRs.map((pr: { url: string }) => pr.url).join(', ')}`);
        }
        info(`  Created:   ${data.createdAt}`);
        info(`  Updated:   ${data.updatedAt}`);
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch feature.');
      handleApiError(err);
    }
  });
