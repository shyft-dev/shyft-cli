import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createPhaseTracker, type PhaseApiClient } from '../lib/analytics.js';
import { createContextManager } from '../lib/context.js';

function createMockApiClient(): PhaseApiClient {
  let callCount = 0;
  return {
    async startPhase() {
      callCount++;
      return { sessionId: `session_${callCount}`, eventId: `event_${callCount}` };
    },
    async endPhase(params) {
      callCount++;
      return { success: true, eventId: `event_${callCount}`, durationMs: params.durationMs ?? 0 };
    },
    async getStatus() {
      return { openPhases: [] };
    },
  };
}

describe('analytics command logic', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('start-phase then end-phase returns valid result', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    const startResult = await tracker.startPhase('ideate', 'prod_123', 'feat_456');
    expect(startResult.sessionId).toBeDefined();
    const result = await tracker.endPhase('ideate');
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('ideate');
    expect(result!.sessionId).toBe(startResult.sessionId);
    expect(result!.productId).toBe('prod_123');
    expect(result!.featureId).toBe('feat_456');
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('end-phase with no active phase returns null', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    const result = await tracker.endPhase('build');
    expect(result).toBeNull();
  });

  test('status shows active phases', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    await tracker.startPhase('build', 'prod_1');
    await tracker.startPhase('verify', 'prod_1', 'feat_2');
    const phases = tracker.getActivePhases();
    expect(Object.keys(phases)).toEqual(['build', 'verify']);
    expect(phases.build.productId).toBe('prod_1');
    expect(phases.verify.featureId).toBe('feat_2');
  });
});
