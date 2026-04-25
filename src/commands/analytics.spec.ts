import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createPhaseTracker, type PhaseEventSender } from '../lib/analytics.js';
import { createContextManager } from '../lib/context.js';

describe('analytics command logic', () => {
  let tempDir: string;
  let noopSender: PhaseEventSender;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    noopSender = { sendEvent: async () => {} };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('start-phase then end-phase returns valid result', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, noopSender);
    await tracker.startPhase('ideate', 'prod_123', 'feat_456');
    const result = await tracker.endPhase('ideate');
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('ideate');
    expect(result!.productId).toBe('prod_123');
    expect(result!.featureId).toBe('feat_456');
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('end-phase with no active phase returns null', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, noopSender);
    const result = await tracker.endPhase('plan');
    expect(result).toBeNull();
  });

  test('status shows active phases', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, noopSender);
    await tracker.startPhase('build', 'prod_1');
    await tracker.startPhase('verify', 'prod_1', 'feat_2');
    const phases = tracker.getActivePhases();
    expect(Object.keys(phases)).toEqual(['build', 'verify']);
    expect(phases.build.productId).toBe('prod_1');
    expect(phases.verify.featureId).toBe('feat_2');
  });
});
