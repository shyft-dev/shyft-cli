import { Command } from 'commander';
import { getContextManager } from '../lib/context.js';
import { output, success, info, error, isJsonMode } from '../utils/output.js';
import { EXIT_CODES } from '../lib/constants.js';

export const contextCommand = new Command('context')
  .description('Manage active product/feature context for this directory')
  .action(() => {
    showContext();
  });

function showContext(): void {
  const ctx = getContextManager().load();
  const hasContext = ctx.productId || ctx.featureId;

  if (!hasContext) {
    if (isJsonMode()) {
      output({});
    } else {
      info('No active context. Run `shyft context set --product <id>` to set one.');
    }
    return;
  }

  if (isJsonMode()) {
    output(ctx);
  } else {
    if (ctx.productId) info(`  Product: ${ctx.productId}`);
    if (ctx.featureId) info(`  Feature: ${ctx.featureId}`);
  }
}

contextCommand
  .command('show')
  .description('Show active product/feature context')
  .action(() => {
    showContext();
  });

contextCommand
  .command('set')
  .description('Set active product and/or feature context')
  .option('--product <id>', 'Set active product ID')
  .option('--feature <id>', 'Set active feature ID')
  .action((opts: { product?: string; feature?: string }) => {
    if (!opts.product && !opts.feature) {
      error('Provide --product <id> and/or --feature <id>');
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const mgr = getContextManager();
    if (opts.product) mgr.setProduct(opts.product);
    if (opts.feature) mgr.setFeature(opts.feature);

    const ctx = mgr.load();
    if (isJsonMode()) {
      output(ctx);
    } else {
      if (opts.product) success(`Active product set to ${opts.product}`);
      if (opts.feature) success(`Active feature set to ${opts.feature}`);
    }
  });

contextCommand
  .command('clear')
  .description('Clear context (default: feature only)')
  .option('--product', 'Clear product and feature context')
  .option('--all', 'Clear all context')
  .action((opts: { product?: boolean; all?: boolean }) => {
    const mgr = getContextManager();

    if (opts.all) {
      mgr.clearAll();
      if (isJsonMode()) {
        output({ cleared: 'all' });
      } else {
        success('Cleared all context.');
      }
    } else if (opts.product) {
      mgr.clearProduct();
      if (isJsonMode()) {
        output({ cleared: 'product' });
      } else {
        success('Cleared product and feature context.');
      }
    } else {
      mgr.clearFeature();
      if (isJsonMode()) {
        output({ cleared: 'feature' });
      } else {
        success('Cleared feature context.');
      }
    }
  });
