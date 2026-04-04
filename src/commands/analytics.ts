import { Command } from 'commander';
import { getPhaseTracker } from '../lib/analytics.js';
import { getProjectConfigManager } from '../lib/project-config.js';
import { getContextManager } from '../lib/context.js';
import { output, success, error, info, isJsonMode } from '../utils/output.js';
import { EXIT_CODES } from '../lib/constants.js';

export const analyticsCommand = new Command('analytics')
  .description('Track SDLC phase analytics');

analyticsCommand
  .command('start-phase <phase>')
  .description('Start tracking a phase (ideate, plan, build, verify)')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .option('--feature <id>', 'Feature ID (defaults to context)')
  .action(async (phase: string, opts: { product?: string; feature?: string }) => {
    try {
      const projMgr = getProjectConfigManager();
      const ctxMgr = getContextManager();

      const productId = opts.product || projMgr.load().productId;
      if (!productId) {
        error('No product ID available. Use --product <id> or run: shyft init');
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }

      const featureId = opts.feature || ctxMgr.load().featureId;

      const tracker = getPhaseTracker();
      const active = tracker.getActivePhases();
      if (active[phase]) {
        error(`Phase "${phase}" is already active. End it first with: shyft analytics end-phase ${phase}`);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }

      await tracker.startPhase(phase, productId, featureId);

      if (isJsonMode()) {
        output({ phase, status: 'started', productId, featureId: featureId || null });
      } else {
        success(`Phase "${phase}" started`);
      }
    } catch (err: any) {
      error(err.message || 'Failed to start phase');
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }
  });

analyticsCommand
  .command('end-phase <phase>')
  .description('End tracking a phase and report duration')
  .action(async (phase: string) => {
    try {
      const tracker = getPhaseTracker();
      const result = await tracker.endPhase(phase);

      if (!result) {
        error(`No active phase "${phase}" found. Start one with: shyft analytics start-phase ${phase}`);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }

      if (isJsonMode()) {
        output({
          phase: result.phase,
          status: 'completed',
          durationMs: result.durationMs,
          productId: result.productId,
          featureId: result.featureId || null,
        });
      } else {
        const seconds = (result.durationMs / 1000).toFixed(1);
        success(`Phase "${result.phase}" completed (${seconds}s)`);
      }
    } catch (err: any) {
      error(err.message || 'Failed to end phase');
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }
  });

analyticsCommand
  .command('status')
  .description('Show active phases')
  .action(() => {
    try {
      const tracker = getPhaseTracker();
      const phases = tracker.getActivePhases();
      const entries = Object.entries(phases);

      if (isJsonMode()) {
        output({ activePhases: phases });
        return;
      }

      if (entries.length === 0) {
        info('No active phases.');
        return;
      }

      info('Active phases:');
      for (const [phase, state] of entries) {
        const elapsed = ((Date.now() - state.startedAt) / 1000).toFixed(1);
        const feature = state.featureId ? ` (feature: ${state.featureId})` : '';
        info(`  ${phase}: ${elapsed}s elapsed${feature}`);
      }
    } catch (err: any) {
      error(err.message || 'Failed to get phase status');
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }
  });
