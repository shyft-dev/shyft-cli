import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createPhaseTracker } from './analytics.js';
import type { PhaseApiClient } from './analytics.js';
import { createContextManager } from './context.js';

function createMockApiClient(events: any[] = []): PhaseApiClient {
  let callCount = 0;
  return {
    async startPhase(params) {
      callCount++;
      const result = { sessionId: `session_${callCount}`, eventId: `event_${callCount}` };
      events.push({ type: 'start', params, result });
      return result;
    },
    async endPhase(params) {
      callCount++;
      const result = { success: true, eventId: `event_${callCount}`, durationMs: params.durationMs ?? 1000 };
      events.push({ type: 'end', params, result });
      return result;
    },
    async getStatus(params) {
      events.push({ type: 'status', params });
      return { openPhases: [] };
    },
  };
}

describe('PhaseTracker state management', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('getActivePhases returns empty object when no context file', () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    expect(tracker.getActivePhases()).toEqual({});
  });

  test('startPhase records phase with sessionId', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    const result = await tracker.startPhase('ideate', 'prod_123');
    expect(result.sessionId).toBe('session_1');
    expect(result.eventId).toBe('event_1');
    const phases = tracker.getActivePhases();
    expect(phases.ideate).toBeDefined();
    expect(phases.ideate.sessionId).toBe('session_1');
    expect(phases.ideate.startedAt).toBeGreaterThan(0);
    expect(phases.ideate.productId).toBe('prod_123');
  });

  test('startPhase persists sessionId to context.json activePhases', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    await tracker.startPhase('build', 'prod_123');
    const raw = readFileSync(join(tempDir, '.shyft', 'context.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.activePhases.build.productId).toBe('prod_123');
    expect(parsed.activePhases.build.sessionId).toBe('session_1');
  });

  test('endPhase removes phase from state and returns result', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    await tracker.startPhase('build', 'prod_123');
    const result = await tracker.endPhase('build');
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('build');
    expect(result!.sessionId).toBe('session_1');
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    expect(tracker.getActivePhases().build).toBeUndefined();
  });

  test('endPhase returns null for unknown phase', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    const result = await tracker.endPhase('nonexistent');
    expect(result).toBeNull();
  });

  test('startPhase stores featureId when provided', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    await tracker.startPhase('verify', 'prod_123', 'feat_456');
    const phases = tracker.getActivePhases();
    expect(phases.verify.featureId).toBe('feat_456');
  });

  test('getActivePhases reads persisted state across instances', async () => {
    const ctx = createContextManager(tempDir);
    const tracker1 = createPhaseTracker(ctx, createMockApiClient());
    await tracker1.startPhase('ideate', 'prod_123');

    const ctx2 = createContextManager(tempDir);
    const tracker2 = createPhaseTracker(ctx2, createMockApiClient());
    const phases = tracker2.getActivePhases();
    expect(phases.ideate).toBeDefined();
    expect(phases.ideate.productId).toBe('prod_123');
    expect(phases.ideate.sessionId).toBe('session_1');
  });

  test('phase data coexists with featureId in context', async () => {
    const ctx = createContextManager(tempDir);
    ctx.setFeature('feat_789');
    const tracker = createPhaseTracker(ctx, createMockApiClient());
    await tracker.startPhase('build', 'prod_123');

    const loaded = ctx.load();
    expect(loaded.featureId).toBe('feat_789');
    expect(loaded.activePhases!.build.productId).toBe('prod_123');
  });
});

describe('PhaseTracker API calls', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('startPhase calls API with correct params', async () => {
    const events: any[] = [];
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient(events));
    await tracker.startPhase('ideate', 'prod_1', 'feat_1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('start');
    expect(events[0].params).toMatchObject({
      phase: 'ideate',
      productId: 'prod_1',
      featureId: 'feat_1',
    });
  });

  test('endPhase calls API with sessionId from start', async () => {
    const events: any[] = [];
    const apiClient = createMockApiClient(events);
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, apiClient);
    await tracker.startPhase('build', 'prod_1');
    await tracker.endPhase('build');
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('end');
    expect(events[1].params.sessionId).toBe('session_1');
    expect(events[1].params.phase).toBe('build');
    expect(events[1].params.productId).toBe('prod_1');
  });

  test('endPhase passes options through to API', async () => {
    const events: any[] = [];
    const apiClient = createMockApiClient(events);
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, apiClient);
    await tracker.startPhase('build', 'prod_1');
    await tracker.endPhase('build', { status: 'completed', reason: 'manual_close' });
    expect(events[1].params.status).toBe('completed');
    expect(events[1].params.reason).toBe('manual_close');
  });

  test('startPhase passes metadata through', async () => {
    const events: any[] = [];
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient(events));
    await tracker.startPhase('ideate', 'prod_1', undefined, { iteration: 2 });
    expect(events[0].params.metadata).toEqual({ iteration: 2 });
  });

  test('endPhase passes metadata through', async () => {
    const events: any[] = [];
    const apiClient = createMockApiClient(events);
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, apiClient);
    await tracker.startPhase('build', 'prod_1');
    await tracker.endPhase('build', { metadata: { linesChanged: 42 } });
    expect(events[1].params.metadata).toEqual({ linesChanged: 42 });
  });

  test('getStatus delegates to API client', async () => {
    const events: any[] = [];
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, createMockApiClient(events));
    const result = await tracker.getStatus({ productId: 'prod_1' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('status');
    expect(events[0].params).toEqual({ productId: 'prod_1' });
    expect(result.openPhases).toEqual([]);
  });

  test('startPhase throws when API fails', async () => {
    const apiClient: PhaseApiClient = {
      async startPhase() { throw new Error('network fail'); },
      async endPhase() { return { success: true, eventId: 'e1', durationMs: 0 }; },
      async getStatus() { return { openPhases: [] }; },
    };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, apiClient);
    await expect(tracker.startPhase('ideate', 'prod_1')).rejects.toThrow('network fail');
    // Phase should NOT be saved locally since API failed
    expect(tracker.getActivePhases().ideate).toBeUndefined();
  });

  test('endPhase throws when API fails but preserves local state', async () => {
    let shouldFail = false;
    const apiClient: PhaseApiClient = {
      async startPhase() { return { sessionId: 's1', eventId: 'e1' }; },
      async endPhase() { if (shouldFail) throw new Error('network fail'); return { success: true, eventId: 'e2', durationMs: 0 }; },
      async getStatus() { return { openPhases: [] }; },
    };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, apiClient);
    await tracker.startPhase('verify', 'prod_1');
    shouldFail = true;
    await expect(tracker.endPhase('verify')).rejects.toThrow('network fail');
    // Phase should still be in local state since API failed
    expect(tracker.getActivePhases().verify).toBeDefined();
  });
});
