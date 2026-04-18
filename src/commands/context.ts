import { Command } from 'commander';
import { getContextManager } from '../lib/context.js';
import { getProjectConfigManager } from '../lib/project-config.js';
import { getApiClient, ApiClientError } from '../lib/api-client.js';
import { output, success, info, error, isJsonMode } from '../utils/output.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { EXIT_CODES } from '../lib/constants.js';

export const contextCommand = new Command('context')
  .description('Manage per-directory product and feature context')
  .action(() => {
    showContext();
  });

function showContext(): void {
  const projMgr = getProjectConfigManager();
  const ctxMgr = getContextManager();
  const projConfig = projMgr.load();
  const userCtx = ctxMgr.load();

  const merged = {
    productId: projConfig.productId || null,
    featureId: userCtx.featureId || null,
  };

  if (isJsonMode()) {
    output(merged);
    return;
  }

  if (!merged.productId && !merged.featureId) {
    info('No context set. Use: shyft context set --product <id> --feature <id>');
    return;
  }

  if (merged.productId) info(`  Product: ${merged.productId}`);
  if (merged.featureId) info(`  Feature: ${merged.featureId}`);
}

contextCommand
  .command('show')
  .description('Show current context')
  .action(() => {
    showContext();
  });

contextCommand
  .command('set')
  .description('Set product or feature context')
  .option('--product <id>', 'Set product ID (saved to project config)')
  .option('--feature <id>', 'Set feature ID (saved to user context)')
  .action((opts) => {
    if (!opts.product && !opts.feature) {
      error('Provide --product <id> and/or --feature <id>');
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    if (opts.product) {
      const projMgr = getProjectConfigManager();
      projMgr.setProductId(opts.product);
      success(`Product set to ${opts.product} (project config)`);
    }

    if (opts.feature) {
      const ctxMgr = getContextManager();
      ctxMgr.setFeature(opts.feature);
      success(`Feature set to ${opts.feature} (user context)`);
    }
  });

contextCommand
  .command('clear')
  .description('Clear context')
  .option('--product', 'Clear product (from project config)')
  .option('--all', 'Clear everything')
  .action((opts) => {
    const projMgr = getProjectConfigManager();
    const ctxMgr = getContextManager();

    if (opts.all) {
      projMgr.update({ productId: undefined });
      ctxMgr.clearAll();
      success('All context cleared.');
      return;
    }

    if (opts.product) {
      projMgr.update({ productId: undefined });
      ctxMgr.clearAll();
      success('Product and feature context cleared.');
      return;
    }

    // Default: clear feature only
    ctxMgr.clearFeature();
    success('Feature context cleared.');
  });

// --- Remote product context commands ---

function handleApiError(err: unknown): never {
  if (err instanceof ApiClientError) {
    error(err.message);
    if (err.status === 404) process.exit(EXIT_CODES.GENERAL_ERROR);
    if (err.status === 401) process.exit(EXIT_CODES.AUTH_REQUIRED);
    process.exit(EXIT_CODES.API_ERROR);
  }
  throw err;
}

function resolveProduct(explicit?: string): string {
  const projMgr = getProjectConfigManager();
  return projMgr.resolveProductId(explicit);
}

contextCommand
  .command('overview')
  .description('Get product context overview')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .action(async (opts: { product?: string }) => {
    let productId: string;
    try {
      productId = resolveProduct(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching product overview...');
    try {
      const client = getApiClient();
      const { data } = await client.get(`/products/${productId}/context/overview`);
      succeedSpinner('Product overview loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        info('');
        info(`  Product:      ${data.product.name}`);
        info(`  Description:  ${data.product.description || '(none)'}`);
        info(`  Vision:       ${data.product.vision || '(none)'}`);
        info('');
        info('  Feature Counts:');
        const fc = data.featureCounts || {};
        info(`    Ideate: ${fc.ideate ?? 0}   Build: ${fc.build ?? 0}   Ship: ${fc.ship ?? 0}`);
        info('');
        if (data.repositories && data.repositories.length > 0) {
          info('  Repositories:');
          for (const repo of data.repositories) {
            info(`    - ${repo.name}`);
            if (repo.architectureExcerpt) {
              const excerpt = repo.architectureExcerpt.slice(0, 120).replace(/\n/g, ' ');
              info(`      ${excerpt}${repo.architectureExcerpt.length > 120 ? '...' : ''}`);
            }
          }
        } else {
          info('  Repositories: (none)');
        }
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch product overview.');
      handleApiError(err);
    }
  });

contextCommand
  .command('features')
  .description('List product features for context analysis')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .option('--stage <stage>', 'Filter by stage (ideate, build, ship)')
  .action(async (opts: { product?: string; stage?: string }) => {
    let productId: string;
    try {
      productId = resolveProduct(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching features...');
    try {
      const client = getApiClient();
      const params: Record<string, string> = {};
      if (opts.stage) params.stage = opts.stage;
      const { data } = await client.get(`/products/${productId}/context/features`, { params });
      succeedSpinner('Features loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        if (!data.features || data.features.length === 0) {
          info('No features found.');
          return;
        }
        info('');
        info(`  ${'ID'.padEnd(28)} ${'Stage'.padEnd(8)} ${'Title'.padEnd(30)} Affected Areas`);
        info(`  ${'─'.repeat(28)} ${'─'.repeat(8)} ${'─'.repeat(30)} ${'─'.repeat(20)}`);
        for (const f of data.features) {
          const areas = (f.affectedAreas || []).join(', ') || '—';
          info(`  ${String(f.id).padEnd(28)} ${String(f.stage).padEnd(8)} ${String(f.title).slice(0, 30).padEnd(30)} ${areas}`);
        }
        info(`\n  Total: ${data.total}`);
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch features.');
      handleApiError(err);
    }
  });

contextCommand
  .command('feature <featureId>')
  .description('Get full feature detail for conflict analysis')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .action(async (featureId: string, opts: { product?: string }) => {
    let productId: string;
    try {
      productId = resolveProduct(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching feature detail...');
    try {
      const client = getApiClient();
      const { data } = await client.get(`/products/${productId}/context/features/${featureId}`);
      succeedSpinner('Feature detail loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        info('');
        info(`  ID:      ${data.id}`);
        info(`  Title:   ${data.title}`);
        info(`  Intent:  ${data.intent || '(none)'}`);
        info(`  Stage:   ${data.stage}`);
        if (data.plan) {
          info('');
          info('  Plan:');
          info(`    Overview:    ${data.plan.overview}`);
          info(`    Complexity:  ${data.plan.estimatedComplexity}`);
          if (data.plan.steps?.length) {
            info('    Steps:');
            for (const step of data.plan.steps) {
              info(`      - ${step.title}: ${step.description}`);
            }
          }
          const files = data.plan.files || {};
          if (files.create?.length) info(`    Create: ${files.create.join(', ')}`);
          if (files.modify?.length) info(`    Modify: ${files.modify.join(', ')}`);
          if (files.delete?.length) info(`    Delete: ${files.delete.join(', ')}`);
          if (data.plan.affectedAreas?.length) {
            info(`    Affected Areas: ${data.plan.affectedAreas.join(', ')}`);
          }
        }
        if (data.linkedPRs?.length) {
          info('');
          info('  Linked PRs:');
          for (const pr of data.linkedPRs) {
            info(`    - #${pr.number} (${pr.status}) ${pr.url}`);
          }
        }
        if (data.externalSync) {
          info(`  External: ${data.externalSync.source} — ${data.externalSync.externalUrl}`);
        }
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch feature detail.');
      handleApiError(err);
    }
  });

contextCommand
  .command('architecture')
  .description('Get architecture docs for linked repositories')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .option('--repo <id>', 'Filter to a specific repository')
  .option('--section <name>', 'Filter to a section (ARCHITECTURE, CONVENTIONS, STRUCTURE, STACK)')
  .action(async (opts: { product?: string; repo?: string; section?: string }) => {
    let productId: string;
    try {
      productId = resolveProduct(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching architecture docs...');
    try {
      const client = getApiClient();
      const params: Record<string, string> = {};
      if (opts.repo) params.repoId = opts.repo;
      if (opts.section) params.section = opts.section;
      const { data } = await client.get(`/products/${productId}/context/architecture`, { params });
      succeedSpinner('Architecture docs loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        if (!data.repositories || data.repositories.length === 0) {
          info('No architecture docs found.');
          return;
        }
        for (const repo of data.repositories) {
          info('');
          info(`  Repository: ${repo.repoName} (${repo.repoId})`);
          info(`  ${'─'.repeat(60)}`);
          const sections = repo.sections || {};
          const keys = Object.keys(sections);
          if (keys.length === 0) {
            info('    (no sections available)');
          } else {
            for (const key of keys) {
              info(`\n  [${key}]`);
              info(`  ${sections[key]}`);
            }
          }
        }
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch architecture docs.');
      handleApiError(err);
    }
  });

contextCommand
  .command('plans')
  .description('Get active implementation plans (features in build stage)')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .action(async (opts: { product?: string }) => {
    let productId: string;
    try {
      productId = resolveProduct(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const spinner = startSpinner('Fetching active plans...');
    try {
      const client = getApiClient();
      const { data } = await client.get(`/products/${productId}/context/plans`);
      succeedSpinner('Plans loaded.');

      if (isJsonMode()) {
        output(data);
      } else {
        if (!data.plans || data.plans.length === 0) {
          info('No active plans found.');
          return;
        }
        for (const entry of data.plans) {
          info('');
          info(`  Feature: ${entry.featureTitle} (${entry.featureId})`);
          info(`  Build:   ${entry.build.status} — step ${entry.build.currentStep}/${entry.build.totalSteps}`);
          if (entry.build.branchName) info(`  Branch:  ${entry.build.branchName}`);
          if (entry.plan) {
            info(`  Plan:    ${entry.plan.overview}`);
            if (entry.plan.affectedAreas?.length) {
              info(`  Areas:   ${entry.plan.affectedAreas.join(', ')}`);
            }
          }
          info(`  ${'─'.repeat(60)}`);
        }
        info('');
      }
    } catch (err) {
      failSpinner('Failed to fetch plans.');
      handleApiError(err);
    }
  });

contextCommand
  .command('search <query>')
  .description('Semantic code search across product repositories')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .option('--limit <n>', 'Max results (default 10, max 50)', '10')
  .action(async (query: string, opts: { product?: string; limit: string }) => {
    let productId: string;
    try {
      productId = resolveProduct(opts.product);
    } catch (err) {
      error((err as Error).message);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 10, 1), 50);

    const spinner = startSpinner('Searching codebase...');
    try {
      const client = getApiClient();
      const { data } = await client.post(`/products/${productId}/context/search`, { query, limit });
      succeedSpinner('Search complete.');

      if (isJsonMode()) {
        output(data);
      } else {
        if (!data.results || data.results.length === 0) {
          info('No results found.');
          return;
        }
        info('');
        for (const r of data.results) {
          const score = (r.score * 100).toFixed(1);
          info(`  ${r.filePath}:${r.startLine}-${r.endLine}  ${r.nodeName} (${r.nodeKind})  [${score}%]`);
          if (r.content) {
            const preview = r.content.split('\n').slice(0, 3).join('\n    ');
            info(`    ${preview}`);
          }
          info('');
        }
      }
    } catch (err) {
      failSpinner('Search failed.');
      handleApiError(err);
    }
  });
