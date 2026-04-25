import { Command } from 'commander';
import { getPhaseTracker } from '../lib/analytics.js';
import { getProjectConfigManager } from '../lib/project-config.js';
import { getContextManager } from '../lib/context.js';
import { output, success, error, info, isJsonMode } from '../utils/output.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { EXIT_CODES } from '../lib/constants.js';

export const analyticsCommand = new Command('analytics')
  .description('Track SDLC phase analytics');

analyticsCommand
  .command('start-phase <phase>')
  .description('Start tracking a phase (ideate, build, verify)')
  .option('--product <id>', 'Product ID (defaults to project config)')
  .option('--feature <id>', 'Feature ID (defaults to context)')
  .action(async (phase: string, opts: { product?: string; feature?: string }) => {
    const validPhases = ['ideate', 'build', 'verify'];
    if (!validPhases.includes(phase)) {
      error(`Invalid phase "${phase}". Valid phases: ${validPhases.join(', ')}`);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

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

      const spinner = startSpinner(`Starting ${phase} phase...`);
      const result = await tracker.startPhase(phase, productId, featureId);
      succeedSpinner(`Phase "${phase}" started.`);

      if (isJsonMode()) {
        output({ phase, status: 'started', sessionId: result.sessionId, eventId: result.eventId, productId, featureId: featureId || null });
      } else {
        success(`Phase "${phase}" started`);
        info(`  Session: ${result.sessionId}`);
      }
    } catch (err: any) {
      failSpinner(`Failed to start phase.`);
      error(err.message || 'Failed to start phase');
      process.exit(EXIT_CODES.API_ERROR);
    }
  });

analyticsCommand
  .command('end-phase <phase>')
  .description('End tracking a phase and report duration')
  .option('--status <status>', 'Phase status (e.g. completed, failed)')
  .option('--reason <reason>', 'Reason for ending the phase')
  .action(async (phase: string, opts: { status?: string; reason?: string }) => {
    try {
      const tracker = getPhaseTracker();

      const active = tracker.getActivePhases();
      if (!active[phase]) {
        error(`No active phase "${phase}" found. Start one with: shyft analytics start-phase ${phase}`);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }

      const spinner = startSpinner(`Ending ${phase} phase...`);
      const result = await tracker.endPhase(phase, {
        status: opts.status,
        reason: opts.reason,
      });

      if (!result) {
        failSpinner('Failed to end phase.');
        error(`No active phase "${phase}" found.`);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      }

      succeedSpinner(`Phase "${phase}" ended.`);

      if (isJsonMode()) {
        output({
          phase: result.phase,
          status: 'completed',
          sessionId: result.sessionId,
          eventId: result.eventId,
          durationMs: result.durationMs,
          productId: result.productId,
          featureId: result.featureId || null,
        });
      } else {
        const seconds = (result.durationMs / 1000).toFixed(1);
        success(`Phase "${result.phase}" completed (${seconds}s)`);
      }
    } catch (err: any) {
      failSpinner('Failed to end phase.');
      error(err.message || 'Failed to end phase');
      process.exit(EXIT_CODES.API_ERROR);
    }
  });

analyticsCommand
  .command('status')
  .description('Show active phases')
  .option('--product <id>', 'Filter by product ID')
  .option('--feature <id>', 'Filter by feature ID')
  .option('--session-id <id>', 'Filter by session ID')
  .action(async (opts: { product?: string; feature?: string; sessionId?: string }) => {
    const spinner = startSpinner('Fetching phase status...');
    try {
      const tracker = getPhaseTracker();
      const result = await tracker.getStatus({
        productId: opts.product,
        featureId: opts.feature,
        sessionId: opts.sessionId,
      });

      succeedSpinner('Status loaded.');

      if (isJsonMode()) {
        output(result);
        return;
      }

      if (result.openPhases.length === 0) {
        info('No active phases.');
        return;
      }

      info('Active phases:');
      for (const phase of result.openPhases) {
        const elapsed = (phase.elapsedMs / 1000).toFixed(1);
        const feature = phase.featureId ? ` (feature: ${phase.featureId})` : '';
        info(`  ${phase.phase}: ${elapsed}s elapsed${feature} [session: ${phase.sessionId}]`);
      }
    } catch (err: any) {
      failSpinner('Failed to get status.');
      error(err.message || 'Failed to get phase status');
      process.exit(EXIT_CODES.API_ERROR);
    }
  });
