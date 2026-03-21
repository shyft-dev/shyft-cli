import { Command } from 'commander';
import { getContextManager } from '../lib/context.js';
import { getProjectConfigManager } from '../lib/project-config.js';
import { output, success, info, error, isJsonMode } from '../utils/output.js';
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
