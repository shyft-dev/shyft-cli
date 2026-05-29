import { Command } from 'commander';
import { existsSync as fileExists, readFileSync } from 'fs';
import { basename } from 'path';
import { getApiClient, ApiClientError, gzipJsonBody } from '../lib/api-client.js';
import { getContextManager } from '../lib/context.js';
import { getProjectConfigManager } from '../lib/project-config.js';
import { output, info, success, error, isJsonMode } from '../utils/output.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { EXIT_CODES } from '../lib/constants.js';

function handleApiError(err: unknown, context?: { conflictMessage?: string }): never {
  if (err instanceof ApiClientError) {
    if (err.status === 409 && context?.conflictMessage) {
      error(context.conflictMessage);
    } else {
      error(err.message);
    }
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
    const projMgr = getProjectConfigManager();
    let productId: string;
    try {
      productId = projMgr.resolveProductId(opts.product);
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

featuresCommand
  .command('create')
  .description('Create a new feature')
  .requiredOption('--title <title>', 'Feature title')
  .requiredOption('--intent <intent>', 'Feature intent description')
  .option('--product <id>', 'Product ID')
  .action(async (opts: { title: string; intent: string; product?: string }) => {
    const projMgr = getProjectConfigManager();
    let productId: string;
    try {
      productId = projMgr.resolveProductId(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Creating feature...');
    try {
      const client = getApiClient();
      const { data: enc, headers } = gzipJsonBody({
        title: opts.title,
        intent: opts.intent,
      });
      const { data } = await client.post(`/products/${productId}/features`, enc, { headers });
      succeedSpinner('Feature created.');

      if (isJsonMode()) {
        output(data);
      } else {
        success(`Feature created: ${data.id}`);
        info(`  Title: ${data.title}`);
        info(`  Stage: ${data.stage}`);
      }
    } catch (err) {
      failSpinner('Failed to create feature.');
      handleApiError(err);
    }
  });

featuresCommand
  .command('update [id]')
  .description('Update a feature')
  .option('--title <title>', 'New title')
  .option('--stage <stage>', 'New stage (ideate, build, ship)')
  .option('--intent <intent>', 'New intent description')
  .option('--file <path>', 'Path to a file whose contents will be used as the intent/spec')
  .option('--assignee <userId>', 'Assign to user ID')
  .action(async (id: string | undefined, opts: { title?: string; stage?: string; intent?: string; file?: string; assignee?: string }) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    if (opts.file) {
      if (!fileExists(opts.file)) {
        error(`File not found: ${opts.file}`);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }
      if (!opts.intent) {
        opts.intent = readFileSync(opts.file, 'utf-8');
      }
    }

    const body: Record<string, string> = {};
    if (opts.title) body.title = opts.title;
    if (opts.stage) body.stage = opts.stage;
    if (opts.intent) body.intent = opts.intent;
    if (opts.assignee) body.assignee = opts.assignee;

    if (Object.keys(body).length === 0) {
      error('Provide at least one field to update (--title, --stage, --intent, --file, --assignee).');
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Updating feature...');
    try {
      const client = getApiClient();
      const { data: enc, headers } = gzipJsonBody(body);
      const { data } = await client.patch(`/features/${featureId}`, enc, { headers });
      succeedSpinner('Feature updated.');

      if (isJsonMode()) {
        output(data);
      } else {
        success(`Feature updated: ${data.id}`);
        info(`  Title: ${data.title}`);
        info(`  Stage: ${data.stage}`);
      }
    } catch (err) {
      failSpinner('Failed to update feature.');
      handleApiError(err);
    }
  });

featuresCommand
  .command('delete [id]')
  .description('Delete a feature')
  .option('--force', 'Skip confirmation prompt')
  .action(async (id: string | undefined, opts: { force?: boolean }) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    if (!opts.force && !isJsonMode()) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(`Delete feature ${featureId}? (y/N) `, resolve);
      });
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        info('Cancelled.');
        return;
      }
    } else if (isJsonMode() && !opts.force) {
      error('Use --force to delete in JSON mode.');
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Deleting feature...');
    try {
      const client = getApiClient();
      await client.delete(`/features/${featureId}`);
      succeedSpinner('Feature deleted.');

      if (isJsonMode()) {
        output({ deleted: featureId });
      } else {
        success(`Feature deleted: ${featureId}`);
      }
    } catch (err) {
      failSpinner('Failed to delete feature.');
      handleApiError(err);
    }
  });

featuresCommand
  .command('plan [id]')
  .description('Generate an implementation plan for a feature')
  .action(async (id?: string) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Generating plan...');
    try {
      const client = getApiClient();
      const { data } = await client.post(`/features/${featureId}/plan/generate`, {});
      succeedSpinner('Plan generated.');

      if (isJsonMode()) {
        output(data);
      } else {
        // TODO: Format human-readable output once API response shape is finalized
        if (data && typeof data === 'object') {
          output(data);
        } else {
          success('Plan generated successfully.');
        }
      }
    } catch (err) {
      failSpinner('Failed to generate plan.');
      handleApiError(err);
    }
  });

featuresCommand
  .command('plan-history [id]')
  .description('Get plan version history for a feature')
  .action(async (id?: string) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching plan history...');
    try {
      const client = getApiClient();
      const { data } = await client.get(`/features/${featureId}/plan/history`);
      succeedSpinner('Plan history loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        if (!data || (Array.isArray(data) && data.length === 0)) {
          info('No plan history found.');
          return;
        }
        // TODO: Format human-readable output once API response shape is finalized
        output(data);
      }
    } catch (err) {
      failSpinner('Failed to fetch plan history.');
      handleApiError(err);
    }
  });

featuresCommand
  .command('plan-write [id]')
  .description('Write plan content for a feature')
  .requiredOption('--file <path>', 'Path to the plan markdown file')
  .option('--allow-overwrite', 'Overwrite an existing draft plan', false)
  .action(async (id: string | undefined, opts: { file: string; allowOverwrite: boolean }) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    if (!fileExists(opts.file)) {
      error(`File not found: ${opts.file}`);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const content = readFileSync(opts.file, 'utf-8');

    const spinner = startSpinner('Writing plan...');
    try {
      const client = getApiClient();
      const { data: enc, headers } = gzipJsonBody({ content, allowOverwrite: opts.allowOverwrite });
      const { data } = await client.put(`/features/${featureId}/plan`, enc, { headers });
      succeedSpinner('Plan written.');

      if (isJsonMode()) {
        output(data);
      } else {
        success(`Plan written for feature ${featureId}`);
      }
    } catch (err) {
      failSpinner('Failed to write plan.');
      handleApiError(err, {
        conflictMessage: `A draft plan already exists for feature ${featureId}. Use --allow-overwrite to replace it.`,
      });
    }
  });

featuresCommand
  .command('plan-approve [id]')
  .description('Approve the current draft plan for a feature')
  .action(async (id?: string) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Approving plan...');
    try {
      const client = getApiClient();
      const { data } = await client.patch(`/features/${featureId}/plan/approve`, {});
      succeedSpinner('Plan approved.');

      if (isJsonMode()) {
        output(data);
      } else {
        success(`Plan approved for feature ${featureId}`);
        if (data?.plan?.version !== undefined) {
          info(`  Plan version: ${data.plan.version}`);
        }
        if (data?.plan?.status) {
          info(`  Status: ${data.plan.status}`);
        }
      }
    } catch (err) {
      failSpinner('Failed to approve plan.');
      handleApiError(err);
    }
  });

function parseGitHubPRUrl(url: string): { number: number; repoFullName: string } | null {
  const match = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i);
  if (!match) return null;
  const [, repoFullName, numStr] = match;
  const number = parseInt(numStr, 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return { number, repoFullName };
}

featuresCommand
  .command('link-pr [id]')
  .description('Link a pull request to a feature')
  .requiredOption('--url <url>', 'Full URL of the PR (e.g. https://github.com/owner/repo/pull/42)')
  .option('--number <n>', 'PR number (parsed from --url if omitted)')
  .option('--repo <owner/repo>', 'Repository full name (parsed from --url if omitted)')
  .action(async (id: string | undefined, opts: { url: string; number?: string; repo?: string }) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    let number: number | undefined;
    let repoFullName: string | undefined = opts.repo;

    if (opts.number) {
      const parsed = parseInt(opts.number, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        error(`Invalid --number value: ${opts.number}`);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }
      number = parsed;
    }

    if (number === undefined || !repoFullName) {
      const parsed = parseGitHubPRUrl(opts.url);
      if (!parsed) {
        error('Could not parse PR number and repo from --url. Provide --number and --repo explicitly, or use a GitHub PR URL like https://github.com/owner/repo/pull/42');
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }
      if (number === undefined) number = parsed.number;
      if (!repoFullName) repoFullName = parsed.repoFullName;
    }

    const spinner = startSpinner('Linking PR...');
    try {
      const client = getApiClient();
      const { data } = await client.post(`/features/${featureId}/link-pr`, {
        url: opts.url,
        number,
        repoFullName,
      });
      succeedSpinner('PR linked.');

      if (isJsonMode()) {
        output(data);
      } else {
        success(`PR linked to feature ${featureId}`);
        info(`  PR: ${repoFullName}#${number}`);
      }
    } catch (err) {
      failSpinner('Failed to link PR.');
      handleApiError(err);
    }
  });

featuresCommand
  .command('upload-doc [id]')
  .description('Upload a document to a feature')
  .requiredOption('--file <path>', 'Path to the file to upload')
  .action(async (id: string | undefined, opts: { file: string }) => {
    const ctx = getContextManager();
    let featureId: string;
    try {
      featureId = ctx.resolveFeatureId(id);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    if (!fileExists(opts.file)) {
      error(`File not found: ${opts.file}`);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const fileBuffer = readFileSync(opts.file);
    // Documents go up as a gzipped JSON body (base64-encoded bytes) rather than
    // multipart: multipart bodies cannot be gzipped through the API's inbound
    // decompressor, so a multipart upload of markdown would still trip the
    // Cloudflare WAF. base64 inflates ~33% and the API caps the decoded JSON at
    // 10MB, so the largest file that fits is ~7MB; larger binaries should use
    // the web UI (multipart there is not WAF-affected for binary content).
    const MAX_JSON_UPLOAD_BYTES = 7 * 1024 * 1024;
    if (fileBuffer.length > MAX_JSON_UPLOAD_BYTES) {
      error(
        `File too large for CLI upload (${(fileBuffer.length / 1048576).toFixed(1)}MB; max 7MB). ` +
          'Upload large files via the Shyft web UI.',
      );
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Uploading document...');
    try {
      const client = getApiClient();
      const { data: enc, headers } = gzipJsonBody({
        filename: basename(opts.file),
        contentBase64: fileBuffer.toString('base64'),
      });
      const { data } = await client.post(`/features/${featureId}/documents/json`, enc, { headers });
      succeedSpinner('Document uploaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        success(`Document uploaded to feature ${featureId}`);
      }
    } catch (err) {
      failSpinner('Failed to upload document.');
      handleApiError(err);
    }
  });
